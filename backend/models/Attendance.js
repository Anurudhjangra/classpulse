const { q, buildWhere, redact, buildQuery, finder, isDupError } = require("../config/db");

const TABLE = "attendance";
const COLS = "id, user_id AS user, class_id AS classId, section, roll_number AS rollNumber, date, status, marked_at AS markedAt";

const FIELDS = {
  _id: "id",
  user: "user_id",
  classId: "class_id",
  section: "section",
  rollNumber: "roll_number",
  date: "date",
  status: "status",
  markedAt: "marked_at",
};

const NUM_FIELDS = new Set(["_id", "user", "classId", "rollNumber"]);

const AGG_COL = {
  rollNumber: "roll_number",
  classId: "class_id",
  section: "section",
  status: "status",
  date: "date",
};

function rowToAttendance(row) {
  if (!row) return null;
  return {
    _id: row.id,
    user: row.user,
    classId: row.classId,
    section: row.section,
    rollNumber: row.rollNumber,
    date: row.date,
    status: row.status,
    markedAt: row.markedAt,
  };
}

const base = finder({ table: TABLE, cols: COLS, rowMapper: rowToAttendance, FIELDS, numFields: NUM_FIELDS });

module.exports = {
  find: base.find,
  findOne: base.findOne,
  findById: base.findById,
  countDocuments: base.countDocuments,
  deleteMany: base.deleteMany,

  async create(obj) {
    const r = await q(
      "INSERT INTO attendance (user_id, class_id, section, roll_number, date, status) VALUES (?, ?, ?, ?, ?, ?)",
      [obj.user, obj.classId, obj.section, obj.rollNumber, obj.date, obj.status]
    );
    const rows = await q(`SELECT ${COLS} FROM attendance WHERE id = ?`, [r.insertId]);
    return rowToAttendance(rows[0]);
  },

  async deleteOne(filter) {
    const { where, params } = buildWhere(filter, FIELDS, NUM_FIELDS);
    const r = await q(`DELETE FROM attendance ${where}`, params);
    return { deletedCount: r.affectedRows };
  },

  async insertMany(docs) {
    if (!docs || !docs.length) return [];
    const values = [];
    const params = [];
    for (const d of docs) {
      values.push("(?, ?, ?, ?, ?, ?)");
      params.push(d.user, d.classId, d.section, d.rollNumber, d.date, d.status);
    }
    await q(
      `INSERT IGNORE INTO attendance (user_id, class_id, section, roll_number, date, status) VALUES ${values.join(", ")}`,
      params
    );
    return docs;
  },

  async aggregate(pipeline) {
    const match = (pipeline[0] && pipeline[0].$match) || {};
    const group = (pipeline.find((s) => s.$group) || {}).$group || null;
    const sortStep = pipeline.find((s) => s.$sort) || null;
    const limitStep = pipeline.find((s) => s.$limit) || null;

    const whereInfo = buildWhere(match, FIELDS, NUM_FIELDS);
    const aggParams = [];

    if (!group) {
      const rows = await q(`SELECT ${COLS} FROM attendance ${whereInfo.where}`, whereInfo.params);
      return rows.map(rowToAttendance);
    }

    const selects = [];
    const groupBy = [];
    let idShape = "none";
    const idKeys = [];

    if (group._id && typeof group._id === "object" && !Array.isArray(group._id)) {
      idShape = "object";
      for (const [key, expr] of Object.entries(group._id)) {
        const field = String(expr).replace(/^\$/, "");
        const col = AGG_COL[field] || field;
        selects.push(`${col}`);
        groupBy.push(col);
        idKeys.push([key, col]);
      }
    } else if (typeof group._id === "string" && group._id.startsWith("$")) {
      idShape = "scalar";
      const field = group._id.slice(1);
      const col = AGG_COL[field] || field;
      selects.push(`${col} AS _id`);
      groupBy.push(col);
    }
    if (idKeys.length === 0 && groupBy.length === 0) idShape = "none";

    for (const [key, expr] of Object.entries(group)) {
      if (key === "_id") continue;
      let sqlExpr = null;
      if (expr === 1) {
        sqlExpr = "COUNT(*)";
      } else if (expr && typeof expr === "object") {
        const sum = expr.$sum;
        if (sum === 1 || sum === 0) {
          sqlExpr = "COUNT(*)";
        } else if (typeof sum === "string" && sum.startsWith("$")) {
          const field = sum.slice(1);
          sqlExpr = `SUM(${AGG_COL[field] || field})`;
        } else if (sum && typeof sum === "object" && Array.isArray(sum.$cond) && sum.$cond.length === 3) {
          const cond = sum.$cond;
          const eq = cond[0] && cond[0].$eq;
          if (eq && eq.length === 2) {
            const field = String(eq[0]).replace(/^\$/, "");
            const col = AGG_COL[field] || field;
            const yes = cond[1] === 1 ? "1" : "0";
            const no = cond[2] === 1 ? "1" : "0";
            sqlExpr = `SUM(IF(${col} = ?, ${yes}, ${no}))`;
            aggParams.push(eq[1]);
          }
        } else if (Array.isArray(expr.$cond) && expr.$cond.length === 3) {
          const cond = expr.$cond;
          const eq = cond[0] && cond[0].$eq;
          if (eq && eq.length === 2) {
            const field = String(eq[0]).replace(/^\$/, "");
            const col = AGG_COL[field] || field;
            const yes = cond[1] === 1 ? "1" : "0";
            const no = cond[2] === 1 ? "1" : "0";
            sqlExpr = `SUM(IF(${col} = ?, ${yes}, ${no}))`;
            aggParams.push(eq[1]);
          }
        }
      }
      if (!sqlExpr) throw new Error("Unsupported attendance aggregation for " + key);
      selects.push(`${sqlExpr} AS \`${key}\``);
    }

    let sql = `SELECT ${selects.join(", ")} FROM attendance ${whereInfo.where}`;
    if (groupBy.length) sql += ` GROUP BY ${groupBy.join(", ")}`;

    if (sortStep) {
      const cols = [];
      for (const [k, d] of Object.entries(sortStep.$sort)) {
        const field = k.startsWith("$") ? k.slice(1) : k;
        const dir = d < 0 ? "DESC" : "ASC";
        if (field === "_id") {
          if (groupBy.length && idShape !== "none") cols.push(`${groupBy[0]} ${dir}`);
        } else {
          cols.push(`${AGG_COL[field] || field} ${dir}`);
        }
      }
      if (cols.length) sql += ` ORDER BY ${cols.join(", ")}`;
    }
    if (limitStep && limitStep.$limit) sql += ` LIMIT ${Number(limitStep.$limit)}`;

    const rows = await q(sql, [...aggParams, ...whereInfo.params]);

    return rows.map((row) => {
      const obj = {};
      if (idShape === "scalar") {
        obj._id = row._id;
      } else if (idShape === "object") {
        obj._id = {};
        for (const [key, col] of idKeys) obj._id[key] = row[col];
      } else {
        obj._id = null;
      }
      for (const [key] of Object.entries(group)) {
        if (key === "_id") continue;
        obj[key] = row[key];
      }
      return obj;
    });
  },
};