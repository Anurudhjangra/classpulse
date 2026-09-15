const bcrypt = require("bcryptjs");
const { q, buildWhere, redact, buildQuery, finder } = require("../config/db");

const TABLE = "users";
const COLS = "id, name, email, mobile, password, current_token AS currentToken, created_at AS createdAt";

const FIELDS = {
  _id: "id",
  name: "name",
  email: "email",
  mobile: "mobile",
  password: "password",
  currentToken: "current_token",
  createdAt: "created_at",
};

const NUM_FIELDS = new Set(["_id"]);

function rowToUser(row) {
  if (!row) return null;
  const u = {
    _id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    password: row.password,
    currentToken: row.currentToken,
    createdAt: row.createdAt,
  };
  u.markModified = () => {};
  u.matchPassword = async (entered) => bcrypt.compare(entered || "", u.password || "");
  u.save = async () => {
    const set = [];
    const params = [];
    if (u.name !== undefined) {
      set.push("name = ?");
      params.push(u.name);
    }
    if (u.email !== undefined) {
      set.push("email = ?");
      params.push(u.email);
    }
    if (u.mobile !== undefined) {
      set.push("mobile = ?");
      params.push(u.mobile || "");
    }
    if (u.currentToken !== undefined) {
      set.push("current_token = ?");
      params.push(u.currentToken);
    }
    if (u.password !== undefined) {
      if (!String(u.password).startsWith("$2")) {
        u.password = await bcrypt.hash(String(u.password), 10);
      }
      set.push("password = ?");
      params.push(u.password);
    }
    if (!set.length) return;
    params.push(u._id);
    await q(`UPDATE users SET ${set.join(", ")} WHERE id = ?`, params);
  };
  return u;
}

const base = finder({ table: TABLE, cols: COLS, rowMapper: rowToUser, FIELDS, numFields: NUM_FIELDS });

module.exports = {
  find: base.find,
  findOne: base.findOne,
  findById: base.findById,
  countDocuments: base.countDocuments,

  async create(obj) {
    const password = await bcrypt.hash(String(obj.password), 10);
    const r = await q(
      "INSERT INTO users (name, email, mobile, password) VALUES (?, ?, ?, ?)",
      [obj.name, obj.email, obj.mobile || "", password]
    );
    const rows = await q(`SELECT ${COLS} FROM users WHERE id = ?`, [r.insertId]);
    return rowToUser(rows[0]);
  },
};