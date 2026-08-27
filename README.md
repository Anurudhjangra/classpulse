# 📋 Online Attendance Management System

A fast, full-stack attendance system for teachers. Mark attendance for 180 students with two clicks (Present/Absent), generate reports, and export them.

## Tech Stack
- **Frontend:** HTML, CSS, Vanilla JavaScript (no build step, no page reloads)
- **Backend:** Node.js + Express
- **Database:** MongoDB (Mongoose ODM)
- **Auth:** JWT (Bearer tokens, bcrypt-hashed passwords)

---

## 🚀 Quick Start

Requirements: Node.js 18+ and MongoDB running on `localhost:27017`.

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. (Optional) Seed demo teacher + 180 students + 20 days of sample data
npm run seed

# 3. Start the server (serves API + frontend on the same port)
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
│   │   ├── constants.js        # MAX_ROLL = 180
│   │   └── db.js               # MongoDB connection
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
│   ├── .env                    # PORT, MONGODB_URI, JWT_SECRET
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

## 🗄 Database Schema (MongoDB collections)

### `users`
| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | unique, lowercase |
| `password` | String | bcrypt hash |
| `createdAt` | Date | |

### `students`
| Field | Type | Notes |
|---|---|---|
| `owner` | ObjectId → users | teacher who owns this roster |
| `rollNumber` | Number (1–180) | unique per owner |
| `name` | String | optional |
| `createdAt` | Date | |

*Index:* `{ owner: 1, rollNumber: 1 }` unique

### `attendance`
| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → users | teacher |
| `rollNumber` | Number (1–180) | |
| `date` | String `YYYY-MM-DD` | |
| `status` | `Present` \| `Absent` | |
| `markedAt` | Date | |

*Index:* `{ user: 1, date: 1, rollNumber: 1 }` unique → **duplicate attendance per date is impossible** at the database level.

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
