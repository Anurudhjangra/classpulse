const { q, finder } = require("../config/db");

const TABLE = "otps";
const COLS = "id, target, otp, purpose, expires_at AS expiresAt, created_at AS createdAt";

const FIELDS = {
  _id: "id",
  target: "target",
  otp: "otp",
  purpose: "purpose",
  expiresAt: "expires_at",
  createdAt: "created_at",
};

const NUM_FIELDS = new Set(["_id"]);

function rowToOtp(row) {
  if (!row) return null;
  return {
    _id: row.id,
    target: row.target,
    otp: row.otp,
    purpose: row.purpose,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

const base = finder({ table: TABLE, cols: COLS, rowMapper: rowToOtp, FIELDS, numFields: NUM_FIELDS });

module.exports = {
  findOne: base.findOne,
  deleteMany: base.deleteMany,

  async create(obj) {
    const r = await q(
      "INSERT INTO otps (target, otp, purpose, expires_at) VALUES (?, ?, ?, ?)",
      [obj.target, obj.otp, obj.purpose || "reset", obj.expiresAt]
    );
    const rows = await q(`SELECT ${COLS} FROM otps WHERE id = ?`, [r.insertId]);
    return rowToOtp(rows[0]);
  },

  async deleteOne(filter) {
    const r = await q(`DELETE FROM otps WHERE id = ?`, [Number(filter._id)]);
    return { deletedCount: r.affectedRows };
  },
};