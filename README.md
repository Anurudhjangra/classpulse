# 📋 Online Attendance Management System

A fast, full-stack attendance system for teachers. Mark attendance for 180 students with two clicks (Present/Absent), generate reports, and export them.

## Tech Stack
- **Frontend:** HTML, CSS, Vanilla JavaScript (no build step, no page reloads)
- **Backend:** Node.js + Express
- **Database:** MySQL (mysql2)
- **Auth:** JWT (Bearer tokens, bcrypt-hashed passwords)

---

## 🚀 Quick Start

Requirements: Node.js 18+ and MySQL running on `localhost:3306`.

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Set your MySQL connection string in backend/.env
#    MYSQL_URL=mysql://USER:PASSWORD@127.0.0.1:3306/classpulse

# 3. (Optional) Seed demo teacher + 180 students + 20 days of sample data
npm run seed

# 4. Start the server (serves API + frontend on the same port)
npm start
```

Open **http://localhost:5000** in your browser.

### Demo account (after seeding)
```
Email:    teacher@demo.com
Password: demo123
```

You can also click **"Create account"** on the login page — a fresh roster of 180 students is auto-created for every new teacher.

> On Windows you can double-click `start.bat` (after `npm install` + `npm run seed`).

---

## 📁 Folder Structure

```
project 2.0/
├── backend/
│   ├── config/
│   │   ├── constants.js        # MAX_ROLL
│   │   └── db.js               # MySQL connection + schema auto-create
│   ├── middleware/
│   │   └── auth.js             # JWT verification middleware
│   ├── models/
│   │   ├── User.js             # Teacher account (bcrypt password)
│   │   ├── Student.js          # Roll 1–180, owner-scoped
│   │   └── Attendance.js       # roll + date + status + user
│   ├── routes/
│   │   ├── auth.js             # signup / login / me
│   │   ├── students.js         # list / update name / ensure roster
│   │   ├── attendance.js       # mark / today / daily / batch / delete
│   │   └── reports.js          # student-wise report + dashboard summary
│   ├── utils/date.js           # date helpers
│   ├── .env                    # PORT, MYSQL_URL, JWT_SECRET
│   ├── seed.js                 # demo data generator
│   ├── server.js               # Express entry point
│   └── package.json
├── frontend/                   # served statically by Express
│   ├── index.html              # Login / Signup
│   ├── dashboard.html          # Summary stats + recent classes
│   ├── attendance.html         # ★ Main marking UI (1 student at a time)
│   ├── report.html             # Reports, filters, bulk daily view, export
│   ├── students.html           # 180-student roster + name editing
│   ├── css/style.css           # Modern responsive UI
│   └── js/
│       ├── api.js              # fetch wrapper + JWT + toasts
│       ├── auth.js
│       ├── dashboard.js
│       ├── attendance.js       # instant roll-advance queue logic
│       ├── report.js
│       └── students.js
├── start.bat                   # one-click launcher (Windows)
└── README.md
```

---

## 🗄 Database Schema (MySQL tables)

*Tables are auto-created on first start (`config/db.js`).*

### `users`
| Field | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `name` | VARCHAR(120) | required |
| `email` | VARCHAR(255) | unique, lowercase |
| `password` | VARCHAR(100) | bcrypt hash |
| `current_token` | VARCHAR(600) | single-session lock |
| `created_at` | TIMESTAMP | |

### `classes`
| Field | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `owner` | INT → users | teacher |
| `name` | VARCHAR(60) | unique per owner |
| `sections` | TEXT (JSON array) | e.g. `["A","B"]` |
| `roll_ranges` | TEXT (JSON object) | per-section roll ranges |

### `students`
| Field | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `owner` | INT → users | teacher who owns this roster |
| `class_id` | INT → classes | |
| `section` | VARCHAR(10) | |
| `roll_number` | INT (1–180) | |
| `name` | VARCHAR(60) | optional |

*Unique:* `(owner, class_id, section, roll_number)`

### `attendance`
| Field | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `user_id` | INT → users | teacher |
| `class_id` | INT → classes | |
| `section` | VARCHAR(10) | |
| `roll_number` | INT (1–180) | |
| `date` | VARCHAR(10) `YYYY-MM-DD` | |
| `status` | VARCHAR(10) | `Present` \| `Absent` |
| `marked_at` | TIMESTAMP | |

*Unique:* `(user_id, class_id, section, date, roll_number)` → **duplicate attendance per date is impossible** at the database level.

---

## 🔌 API Routes (all `/api`)

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | – | Create teacher account (auto-creates 180 students) |
| POST | `/auth/login` | – | Login → returns JWT + user |
| GET | `/auth/me` | ✅ | Current user |
| GET | `/students?search=&limit=` | ✅ | List students (roll 1–180, sequence) |
| PUT | `/students/:rollNumber` | ✅ | Update student name |
| POST | `/students/ensure` | ✅ | Fill missing rolls |
| GET | `/attendance/today?date=` | ✅ | Today's status map + counts |
| GET | `/attendance/daily?date=` | ✅ | All records for a date (bulk view) |
| POST | `/attendance/mark` | ✅ | Mark one roll `{rollNumber, status}` (409 if duplicate) |
| POST | `/attendance/batch` | ✅ | Mark many `{date, records:[{rollNumber,status}]}` |
| DELETE | `/attendance/:rollNumber` | ✅ | Remove a record for the given date (Undo) |
| GET | `/reports/student-wise?month=&from=&to=&roll=` | ✅ | Per-student totals + % |
| GET | `/reports/summary` | ✅ | Dashboard stats + last 7 days |

**Security:** every route (except signup/login) requires `Authorization: Bearer <jwt>`. All queries are scoped to `req.user._id` — teachers can only ever read/write **their own** data.

---

## ✨ Features

- JWT login/signup with per-teacher data isolation
- Auto-generated 180-student roster (roll 1–180 in sequence)
- **Lightning-fast marking:** click Present/Absent → next student appears instantly; saves happen in a background queue (no page reload, keyboard shortcuts `P` / `A` / `U`)
- Duplicate-safe attendance per date (DB unique index + API guard)
- Undo last marking
- Live progress bar + 180-chip status grid
- Reports: student-wise totals, present/absent, attendance %, month/date-range filters, roll search
- **Bulk daily view:** edit multiple students for one date and save at once
- Export to **CSV** (Excel) and **PDF** (browser print)
- Dashboard: total students, today's present/absent, total classes, overall %, recent 7 days
- Mobile responsive

---

## 📊 Sample Data (from `npm run seed`)

- 1 demo teacher: `teacher@demo.com` / `demo123`
- 180 students (roll 1–180, names blank by default)
- ~20 weekdays of attendance (~85–97% present) = ~3,600 records, so reports/dashboard are populated immediately
