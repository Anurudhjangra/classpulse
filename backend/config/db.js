const mysql = require("mysql2/promise");

let pool = null;

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: u.username ? decodeURIComponent(u.username) : "root",
    password: decodeURIComponent(u.password || ""),
    database: u.pathname.replace(/^\//, ""),
  };
}

async function ensureSchema(p) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      mobile VARCHAR(15) NOT NULL DEFAULT '',
      password VARCHAR(100) NOT NULL,
      current_token VARCHAR(600) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_users_email (email)
    )`,
    `CREATE TABLE IF NOT EXISTS classes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner INT NOT NULL,
      name VARCHAR(60) NOT NULL,
      sections TEXT NOT NULL,
      roll_ranges TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_classes_owner_name (owner, name),
      KEY idx_classes_owner (owner)
    )`,
    `CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner INT NOT NULL,
      class_id INT NOT NULL,
      section VARCHAR(10) NOT NULL,
      roll_number INT NOT NULL,
      name VARCHAR(60) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_students_owner_class_section_roll (owner, class_id, section, roll_number),
      KEY idx_students_owner_class_section (owner, class_id, section)
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      class_id INT NOT NULL,
      section VARCHAR(10) NOT NULL,
      roll_number INT NOT NULL,
      date VARCHAR(10) NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'Present',
      marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_attendance_user_class_section_date_roll (user_id, class_id, section, date, roll_number),
      KEY idx_attendance_user_class_section_date (user_id, class_id, section, date),
      KEY idx_attendance_user_date (user_id, date)
    )`,
    `CREATE TABLE IF NOT EXISTS otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      target VARCHAR(255) NOT NULL,
      otp VARCHAR(10) NOT NULL,
      purpose VARCHAR(20) NOT NULL DEFAULT 'reset',
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_otps_target_purpose (target, purpose)
    )`,
  ];
  for (const sql of tables) {
    await p.query(sql);
  }
}

async function connectDB() {
  const url =
    process.env.MYSQL_URL || process.env.MYSQL_URI || process.env.DATABASE_URL || "";
  let host = process.env.DB_HOST || "127.0.0.1";
  let port = Number(process.env.DB_PORT || 3306);
  let user = process.env.DB_USER || "root";
  let password = process.env.DB_PASSWORD || "";
  let database = process.env.DB_NAME || "classpulse";

  if (url) {
    const p = parseDbUrl(url);
    host = p.host;
    port = p.port;
    user = p.user;
    password = p.password;
    database = p.database;
  }

  const makePool = () =>
    mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

  try {
    pool = makePool();
    const conn = await pool.getConnection();
    await conn.query("SELECT 1");
    conn.release();
  } catch (err) {
    const unknownDb = /Unknown database|ER_BAD_DB_ERROR/i.test(String(err.message || ""));
    if (unknownDb) {
      const tmp = mysql.createPool({ host, port, user, password });
      await tmp.query(
        `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      await tmp.end();
      pool = makePool();
      const conn = await pool.getConnection();
      await conn.query("SELECT 1");
      conn.release();
    } else {
      console.error("MySQL connection error:", err.message);
      process.exit(1);
    }
  }

  await ensureSchema(pool);
  console.log(`MySQL connected: ${host}/${database}`);
}

async function q(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

function parseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

const OPS = { $ne: "<>", $gt: ">", $gte: ">=", $lt: "<", $lte: "<=" };

function buildWhere(filter, FIELDS, numFields = new Set()) {
  const clauses = [];
  const params = [];
  for (const key of Object.keys(filter)) {
    const val = filter[key];
    if (key === "$or") {
      if (Array.isArray(val) && val.length) {
        const parts = [];
        for (const sub of val) {
          const r = buildWhere(sub, FIELDS, numFields);
          if (r.where) {
            parts.push(r.where);
            params.push(...r.params);
          }
        }
        if (parts.length) clauses.push(`(${parts.join(" OR ")})`);
      }
      continue;
    }
    const col = FIELDS[key];
    if (!col) continue;
    const norm = (v) => (numFields.has(key) ? Number(v) : v);
    if (val && typeof val === "object") {
      if (val.$regex !== undefined) {
        clauses.push(`${col} LIKE ?`);
        params.push(
          "%" + String(val.$regex).replace(/[%_\\]/g, (m) => "\\" + m) + "%"
        );
      } else {
        const subs = [];
        for (const op of Object.keys(val)) {
          const sym = OPS[op];
          const v = norm(val[op]);
          if (sym !== undefined) subs.push(`${col} ${sym} ?`);
          else subs.push(`${col} = ?`);
          params.push(v);
        }
        if (subs.length === 1) clauses.push(subs[0]);
        else if (subs.length > 1) clauses.push(`(${subs.join(" AND ")})`);
      }
    } else if (val === null) {
      clauses.push(`${col} IS NULL`);
    } else {
      clauses.push(`${col} = ?`);
      params.push(norm(val));
    }
  }
  return {
    where: clauses.length ? "WHERE " + clauses.join(" AND ") : "",
    params,
  };
}

function redact(obj, sel) {
  if (!sel) return obj;
  const parts = String(sel).split(/\s+/).filter(Boolean);
  const removed = new Set();
  const kept = [];
  for (const p of parts) {
    if (p.startsWith("-")) removed.add(p.slice(1));
    else kept.push(p);
  }
  if (kept.length) {
    for (const k of Object.keys(obj)) {
      if (!kept.includes(k)) delete obj[k];
    }
  } else {
    for (const r of removed) delete obj[r];
  }
  return obj;
}

function buildQuery(run) {
  let sel = null;
  let sort = null;
  let lim = null;
  const qobj = {
    select(s) {
      sel = s;
      return qobj;
    },
    sort(s) {
      sort = s;
      return qobj;
    },
    limit(n) {
      lim = parseInt(n, 10);
      return qobj;
    },
    then(resolve, reject) {
      return Promise.resolve(run({ sel, sort, lim })).then(resolve, reject);
    },
  };
  return qobj;
}

function sortClause(sort, FIELDS) {
  if (!sort) return "";
  const parts = [];
  for (const [k, dirRaw] of Object.entries(sort)) {
    const col = FIELDS[k];
    if (!col) continue;
    parts.push(`${col} ${dirRaw < 0 ? "DESC" : "ASC"}`);
  }
  return parts.length ? " ORDER BY " + parts.join(", ") : "";
}

function isDupError(err) {
  return !!err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062);
}

function finder({ table, cols, rowMapper, FIELDS, numFields }) {
  return {
    find(filter) {
      return buildQuery(async ({ sel, sort, lim }) => {
        const { where, params } = buildWhere(filter, FIELDS, numFields);
        let sql = `SELECT ${cols} FROM ${table} ${where}`;
        sql += sortClause(sort, FIELDS);
        if (lim && lim > 0) sql += ` LIMIT ${lim}`;
        const rows = await q(sql, params);
        return rows.map((r) => redact(rowMapper(r), sel));
      });
    },
    findOne(filter) {
      return buildQuery(async ({ sel }) => {
        const { where, params } = buildWhere(filter, FIELDS, numFields);
        const rows = await q(
          `SELECT ${cols} FROM ${table} ${where} LIMIT 1`,
          params
        );
        const r = rows[0];
        return r ? redact(rowMapper(r), sel) : null;
      });
    },
    findById(id) {
      return buildQuery(async ({ sel }) => {
        const rows = await q(
          `SELECT ${cols} FROM ${table} WHERE id = ? LIMIT 1`,
          [Number(id)]
        );
        const r = rows[0];
        return r ? redact(rowMapper(r), sel) : null;
      });
    },
    countDocuments(filter) {
      return buildQuery(async () => {
        const { where, params } = buildWhere(filter, FIELDS, numFields);
        const rows = await q(`SELECT COUNT(*) AS n FROM ${table} ${where}`, params);
        return rows[0].n;
      });
    },
    deleteMany(filter) {
      return (async () => {
        const { where, params } = buildWhere(filter, FIELDS, numFields);
        const r = await q(`DELETE FROM ${table} ${where}`, params);
        return { deletedCount: r.affectedRows };
      })();
    },
  };
}

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.q = q;
module.exports.parseJson = parseJson;
module.exports.buildWhere = buildWhere;
module.exports.redact = redact;
module.exports.buildQuery = buildQuery;
module.exports.sortClause = sortClause;
module.exports.isDupError = isDupError;
module.exports.finder = finder;