const { q, parseJson, finder } = require("../config/db");

const TABLE = "classes";
const COLS = "id, owner, name, sections, roll_ranges AS rollRanges, created_at AS createdAt";

const FIELDS = {
  _id: "id",
  owner: "owner",
  name: "name",
  sections: "sections",
  rollRanges: "roll_ranges",
  createdAt: "created_at",
};

const NUM_FIELDS = new Set(["_id", "owner"]);

function rowToClass(row) {
  if (!row) return null;
  const c = {
    _id: row.id,
    owner: row.owner,
    name: row.name,
    sections: parseJson(row.sections, []),
    rollRanges: parseJson(row.rollRanges, {}),
    createdAt: row.createdAt,
  };
  c.markModified = () => {};
  c.save = async () => {
    const set = [];
    const params = [];
    set.push("name = ?");
    params.push(c.name);
    set.push("sections = ?");
    params.push(JSON.stringify(c.sections || []));
    set.push("roll_ranges = ?");
    params.push(JSON.stringify(c.rollRanges || {}));
    params.push(c._id);
    await q(`UPDATE classes SET ${set.join(", ")} WHERE id = ?`, params);
  };
  return c;
}

const base = finder({ table: TABLE, cols: COLS, rowMapper: rowToClass, FIELDS, numFields: NUM_FIELDS });

module.exports = {
  find: base.find,
  findOne: base.findOne,
  findById: base.findById,
  countDocuments: base.countDocuments,
  deleteMany: base.deleteMany,

  async create(obj) {
    const r = await q(
      "INSERT INTO classes (owner, name, sections, roll_ranges) VALUES (?, ?, ?, ?)",
      [
        obj.owner,
        obj.name,
        JSON.stringify(obj.sections || []),
        JSON.stringify(obj.rollRanges || {}),
      ]
    );
    const rows = await q(`SELECT ${COLS} FROM classes WHERE id = ?`, [r.insertId]);
    return rowToClass(rows[0]);
  },

  async deleteOne(filter) {
    const rows = await q(`DELETE FROM classes WHERE id = ?`, [Number(filter._id)]);
    return { deletedCount: rows.affectedRows };
  },
};