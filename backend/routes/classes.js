const express = require("express");
const Class = require("../models/Class");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const auth = require("../middleware/auth");
const { createRosterForSection, normalizeSections, parseRangesInput, totalFromRanges, formatRanges, DEFAULT_RANGES } = require("../utils/roster");
const { todayStr } = require("../utils/date");

const router = express.Router();

router.use(auth);

function validId(id) {
  return /^[0-9a-fA-F]{24}$/.test(String(id || ""));
}

async function buildGroups(user) {
  const classes = await Class.find({ owner: user._id }).sort({ name: 1 });

  const [studentAgg, attendanceAgg] = await Promise.all([
    Student.aggregate([
      { $match: { owner: user._id } },
      { $group: { _id: { classId: "$classId", section: "$section" }, n: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: { user: user._id, date: todayStr() } },
      {
        $group: {
          _id: { classId: "$classId", section: "$section", status: "$status" },
          n: { $sum: 1 },
        },
      },
    ]),
  ]);

  const studentMap = {};
  studentAgg.forEach((r) => (studentMap[r._id.classId + "|" + r._id.section] = r.n));

  const todayMap = {};
  attendanceAgg.forEach((r) => {
    const key = r._id.classId + "|" + r._id.section;
    if (!todayMap[key]) todayMap[key] = { marked: 0, present: 0, absent: 0 };
    todayMap[key].marked += r.n;
    if (r._id.status === "Present") todayMap[key].present += r.n;
    else todayMap[key].absent += r.n;
  });

  const groups = [];
  classes.forEach((c) => {
    c.sections.forEach((sec) => {
      const key = c._id + "|" + sec;
      groups.push({
        classId: c._id,
        className: c.name,
        section: sec,
        students: studentMap[key] || 0,
        today: todayMap[key] || { marked: 0, present: 0, absent: 0 },
      });
    });
  });

  return { classes, groups };
}

router.get("/", async (req, res) => {
  try {
    const { classes, groups } = await buildGroups(req.user);
    res.json({ classes, groups });
  } catch (err) {
    console.error("List classes error:", err.message);
    res.status(500).json({ message: "Failed to load classes" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, sections, rolls } = req.body;
    const cleanName = String(name || "").trim();
    const cleanSections = normalizeSections(sections);

    if (!cleanName) {
      return res.status(400).json({ message: "Class name is required" });
    }
    if (cleanSections.length === 0) {
      return res.status(400).json({ message: "At least one section is required" });
    }

    const rollMap = {};
    if (rolls && typeof rolls === "object") {
      for (const sec of cleanSections) {
        const key = Object.keys(rolls).find((k) => String(k).toUpperCase() === sec);
        const raw = key !== undefined ? rolls[key] : undefined;
        if (raw === undefined || raw === null || raw === "") continue;
        const parsed = parseRangesInput(raw);
        if (!parsed) {
          return res.status(400).json({ message: `Invalid roll ranges for section ${sec}` });
        }
        rollMap[sec] = parsed;
      }
    }

    const exists = await Class.findOne({ owner: req.user._id, name: cleanName });
    if (exists) {
      return res.status(409).json({ message: `A class named "${cleanName}" already exists` });
    }

    const cls = await Class.create({ owner: req.user._id, name: cleanName, sections: cleanSections, rollRanges: rollMap });

    for (const sec of cleanSections) {
      await createRosterForSection({ owner: req.user._id, classId: cls._id, section: sec, ranges: rollMap[sec] });
    }

    const summary = cleanSections.map((sec) => `${sec}:${totalFromRanges(rollMap[sec] || DEFAULT_RANGES)}`);
    res.status(201).json({
      message: `Class "${cleanName}" created — ${summary.join(", ")} students`,
      class: cls,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A class with this name already exists" });
    }
    console.error("Create class error:", err.message);
    res.status(500).json({ message: "Failed to create class" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ message: "Invalid class id" });

    const cls = await Class.findOne({ owner: req.user._id, _id: id });
    if (!cls) return res.status(404).json({ message: "Class not found" });

    let added = [];

    if (req.body.section && req.body.rolls !== undefined) {
      const sec = String(req.body.section).trim().toUpperCase();
      if (!cls.sections.includes(sec)) {
        return res.status(404).json({ message: "Section not found in this class" });
      }
      const parsed = parseRangesInput(req.body.rolls);
      if (!parsed) {
        return res.status(400).json({ message: "Invalid roll ranges" });
      }
      const count = totalFromRanges(parsed);
      const [studentsRemoved, attendanceRemoved] = await Promise.all([
        Student.deleteMany({ owner: req.user._id, classId: cls._id, section: sec }),
        Attendance.deleteMany({ user: req.user._id, classId: cls._id, section: sec }),
      ]);
      await createRosterForSection({ owner: req.user._id, classId: cls._id, section: sec, ranges: parsed });
      if (!cls.rollRanges || typeof cls.rollRanges !== "object") cls.rollRanges = {};
      cls.rollRanges[sec] = parsed;
      cls.markModified("rollRanges");
      await cls.save();
      return res.json({
        message: `Section ${sec} rolls set to ${formatRanges(parsed)} (${count} students)`,
        section: sec,
        count,
        studentsRemoved: studentsRemoved.deletedCount,
        attendanceRemoved: attendanceRemoved.deletedCount,
      });
    }

    if (req.body.name !== undefined) {
      const cleanName = String(req.body.name || "").trim();
      if (!cleanName) return res.status(400).json({ message: "Class name is required" });
      const dup = await Class.findOne({ owner: req.user._id, name: cleanName, _id: { $ne: id } });
      if (dup) return res.status(409).json({ message: "A class with this name already exists" });
      cls.name = cleanName;
    }

    if (req.body.sections !== undefined) {
      const newSections = normalizeSections(req.body.sections);
      const current = new Set(cls.sections);
      for (const sec of newSections) {
        if (!current.has(sec)) {
          await createRosterForSection({ owner: req.user._id, classId: cls._id, section: sec });
          added.push(sec);
          cls.sections.push(sec);
        }
      }
    }

    await cls.save();
    res.json({
      message: added.length ? `Sections added: ${added.join(", ")}` : "Class updated",
      class: cls,
      added,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A class with this name already exists" });
    }
    console.error("Update class error:", err.message);
    res.status(500).json({ message: "Failed to update class" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ message: "Invalid class id" });

    const cls = await Class.findOne({ owner: req.user._id, _id: id });
    if (!cls) return res.status(404).json({ message: "Class not found" });

    const [students, attendance] = await Promise.all([
      Student.deleteMany({ owner: req.user._id, classId: cls._id }),
      Attendance.deleteMany({ user: req.user._id, classId: cls._id }),
    ]);
    await Class.deleteOne({ _id: cls._id });

    res.json({
      message: `Class "${cls.name}" deleted`,
      studentsRemoved: students.deletedCount,
      attendanceRemoved: attendance.deletedCount,
    });
  } catch (err) {
    console.error("Delete class error:", err.message);
    res.status(500).json({ message: "Failed to delete class" });
  }
});

module.exports = router;
