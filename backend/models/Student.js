const { q, buildWhere, redact, buildQuery, finder, isDupError } = require("../config/db");

const TABLE = "students";
const COLS = "id, owner, class_id AS classId, section, roll_number AS rollNumber, name, created_at AS createdAt";

const FIELDS = {
  _id: "id",
  owner: "owner",
  classId: "class_id",
  section: "section",
  rollNumber: "roll_number",
  name: "name",
  createdAt: "created_at",
};

const NUM_FIELDS = new Set(["_id", "owner", "classId", "rollNumber"]);

function rowToStudent(row) {
  if (!row) return null;
  return {
    _id: row.id,
    owner: row.owner,
    classId: row.classId,
    section: row.section,
    rollNumber: row.rollNumber,
    name: row.name,
    createdAt: row.createdAt,
  };
}

const base = finder({ table: TABLE, cols: COLS, rowMapper: rowToStudent, FIELDS, numFields: NUM_FIELDS });

async function getByFilter(filter) {
  const { where, params } = buildWhere(filter, FIELDS, NUM_FIELDS);
  const rows = await q(`SELECT ${COLS} FROM students ${where} LIMIT 1`, params);
  return rows[0] ? rowToStudent(rows[0]) : null;
}

module.exports = {
  find: base.find,
  findOne: base.findOne,
  countDocuments: base.countDocuments,
  deleteMany: base.deleteMany,

  async deleteOne(filter) {
    const rows = await q(
      `DELETE FROM students WHERE owner = ? AND class_id = ? AND section = ? AND roll_number = ?`,
      [filter.owner, Number(filter.classId), filter.section, Number(filter.rollNumber)]
    );
    return { deletedCount: rows.affectedRows };
  },

  async findOneAndUpdate(filter, update, opts) {
    const setObj = (update && update.$set) || update || {};
    const setCols = ["name = ?"];
    const setParams = [setObj.name !== undefined ? setObj.name : ""];

    const { where, params } = buildWhere(filter, FIELDS, NUM_FIELDS);
    const r = await q(`UPDATE students SET ${setCols.join(", ")} ${where}`, [...setParams, ...params]);

    if (r.affectedRows === 0 && opts && opts.upsert) {
      try {
        const ins = await q(
          "INSERT INTO students (owner, class_id, section, roll_number, name) VALUES (?, ?, ?, ?, ?)",
          [
            filter.owner,
            Number(filter.classId),
            String(filter.section).toUpperCase(),
            Number(filter.rollNumber),
            setObj.name !== undefined ? setObj.name : "",
          ]
        );
        const rows = await q(`SELECT ${COLS} FROM students WHERE id = ?`, [ins.insertId]);
        return rowToStudent(rows[0]);
      } catch (err) {
        if (isDupError(err)) return getByFilter(filter);
        throw err;
      }
    }
    return getByFilter(filter);
  },

  async bulkInsert({ owner, classId, section, rolls }) {
    if (!rolls || !rolls.length) return { inserted: 0 };
    const values = [];
    const params = [];
    for (const roll of rolls) {
      values.push("(?, ?, ?, ?, '')");
      params.push(owner, Number(classId), section, roll);
    }
    const r = await q(
      `INSERT IGNORE INTO students (owner, class_id, section, roll_number, name) VALUES ${values.join(", ")}`,
      params
    );
    return { inserted: r.affectedRows };
  },

  async aggregate(pipeline) {
    const match = (pipeline[0] && pipeline[0].$match) || {};
    const group = (pipeline.find((s) => s.$group) || {}).$group || null;
    if (!group) {
      const { where, params } = buildWhere(match, FIELDS, NUM_FIELDS);
      const rows = await q(`SELECT ${COLS} FROM students ${where}`, params);
      return rows.map(rowToStudent);
    }
    const isClassSection = group._id && typeof group._id === "object" && group._id.classId && group._id.section;
    if (isClassSection) {
      const { where, params } = buildWhere(match, FIELDS, NUM_FIELDS);
      const rows = await q(
        `SELECT class_id AS classId, section, COUNT(*) AS n FROM students ${where} GROUP BY class_id, section`,
        params
      );
      return rows.map((r) => ({ _id: { classId: r.classId, section: r.section }, n: r.n }));
    }
    throw new Error("Unsupported student aggregation");
  },
};