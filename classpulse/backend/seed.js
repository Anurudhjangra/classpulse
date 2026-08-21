require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Class = require("./models/Class");
const Student = require("./models/Student");
const Attendance = require("./models/Attendance");
const { toDateStr } = require("./utils/date");
const { createRosterForSection, expandRanges, DEFAULT_RANGES } = require("./utils/roster");

const DEMO_EMAIL = "teacher@demo.com";
const DEMO_PASSWORD = "demo123";
const DAYS = 20;

const DEMO_CLASSES = [
  { name: "Class 10", sections: ["A", "B"] },
  { name: "Class 11", sections: ["A"] },
];

async function resetDemoData(user) {
  const [sc, ac] = await Promise.all([
    Student.deleteMany({ owner: user._id }),
    Attendance.deleteMany({ user: user._id }),
  ]);
  await Class.deleteMany({ owner: user._id });
  return { studentsRemoved: sc.deletedCount, attendanceRemoved: ac.deletedCount };
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB");

  await Promise.all([Class.syncIndexes(), Student.syncIndexes(), Attendance.syncIndexes()]);

  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    user = await User.create({
      name: "Demo Teacher",
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    console.log("Demo teacher created:", DEMO_EMAIL, "/", DEMO_PASSWORD);
  } else {
    console.log("Demo teacher already exists — resetting demo data");
  }

  const { studentsRemoved, attendanceRemoved } = await resetDemoData(user);
  if (studentsRemoved || attendanceRemoved) {
    console.log(`Removed old demo data (${studentsRemoved} students, ${attendanceRemoved} attendance)`);
  }

  const groups = [];
  for (const demo of DEMO_CLASSES) {
    const cls = await Class.create({ owner: user._id, name: demo.name, sections: demo.sections });
    for (const sec of demo.sections) {
      await createRosterForSection({ owner: user._id, classId: cls._id, section: sec });
      groups.push({ classId: cls._id, section: sec, className: demo.name });
      console.log(`Created ${demo.name} - Section ${sec} (${expandRanges(DEFAULT_RANGES).length} students)`);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 1; dates.length < DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(toDateStr(d));
  }

  let inserted = 0;
  const demoRolls = expandRanges(DEFAULT_RANGES);
  for (const group of groups) {
    for (const date of dates) {
      const docs = [];
      for (const roll of demoRolls) {
        const chance = 0.82 + Math.random() * 0.15;
        docs.push({
          user: user._id,
          classId: group.classId,
          section: group.section,
          rollNumber: roll,
          date,
          status: Math.random() < chance ? "Present" : "Absent",
        });
      }
      const result = await Attendance.insertMany(docs, { ordered: false });
      inserted += result.length;
    }
  }

  console.log(`Seeded ${inserted} attendance records across ${groups.length} groups × ${dates.length} days`);
  console.log("Done. Login with:", DEMO_EMAIL, "/", DEMO_PASSWORD);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
