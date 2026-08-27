const express = require("express");
const Attendance = require("../models/Attendance");
const Class = require("../models/Class");
const auth = require("../middleware/auth");
const { MAX_ROLL } = require("../config/constants");
const { todayStr, validateDateStr } = require("../utils/date");

const router = express.Router();

router.use(auth);

function validId(id) {
  return /^[0-9a-fA-F]{24}$/.test(String(id || ""));
}

function getDate(req) {
  const d = req.body.date || req.query.date;
  if (d && validateDateStr(d)) return d;
  return todayStr();
}

function groupFrom(req) {
  const classId = req.body.classId || req.query.classId;
  const section = (req.body.section || req.query.section || "").toUpperCase();
  if (!validId(classId) || !section) return null;
  return { classId, section };
}

async function authorizeGroup(req) {
  const g = groupFrom(req);
  if (!g) return { error: { status: 400, message: "classId and section are required" } };
  const cls = await Class.findOne({ owner: req.user._id, _id: g.classId });
  if (!cls) return { error: { status: 404, message: "Class not found" } };
  if (!cls.sections.includes(g.section)) {
    return { error: { status: 404, message: "Section not found in this class" } };
  }
  return { group: g, cls };
}

router.get("/today", async (req, res) => {
  try {
    const { error, group } = await authorizeGroup(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const date = getDate(req);
    const records = await Attendance.find({ user: req.user._id, classId: group.classId, section: group.section, date })
      .select("rollNumber status -_id")
      .sort({ rollNumber: 1 });
    const map = {};
    records.forEach((r) => (map[r.rollNumber] = r.status));
    const counts = records.reduce(
      (acc, r) => {
        acc[r.status] += 1;
        return acc;
      },
      { Present: 0, Absent: 0 }
    );
    res.json({ date, marked: records.length, counts, map });
  } catch (err) {
    console.error("Today attendance error:", err.message);
    res.status(500).json({ message: "Failed to load attendance" });
  }
});

router.get("/daily", async (req, res) => {
  try {
    const { error, group } = await authorizeGroup(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const date = getDate(req);
    const records = await Attendance.find({ user: req.user._id, classId: group.classId, section: group.section, date }).sort({ rollNumber: 1 });
    res.json({ date, records });
  } catch (err) {
    console.error("Daily attendance error:", err.message);
    res.status(500).json({ message: "Failed to load daily attendance" });
  }
});

router.post("/mark", async (req, res) => {
  try {
    const { error, group } = await authorizeGroup(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const { rollNumber, status } = req.body;
    const roll = parseInt(rollNumber, 10);
    if (isNaN(roll) || roll < 1 || roll > MAX_ROLL) {
      return res.status(400).json({ message: `Roll number must be between 1 and ${MAX_ROLL}` });
    }
    if (status !== "Present" && status !== "Absent") {
      return res.status(400).json({ message: "Status must be Present or Absent" });
    }
    const date = getDate(req);

    const existing = await Attendance.findOne({ user: req.user._id, classId: group.classId, section: group.section, date, rollNumber: roll });
    if (existing) {
      return res.status(409).json({
        message: "Attendance already marked for this roll on this date",
        record: existing,
        duplicate: true,
      });
    }

    const record = await Attendance.create({
      user: req.user._id,
      classId: group.classId,
      section: group.section,
      rollNumber: roll,
      date,
      status,
    });
    res.status(201).json({ message: "Marked " + status, record });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Attendance already marked", duplicate: true });
    }
    console.error("Mark attendance error:", err.message);
    res.status(500).json({ message: "Failed to mark attendance" });
  }
});

router.delete("/:rollNumber", async (req, res) => {
  try {
    const { error, group } = await authorizeGroup(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const roll = parseInt(req.params.rollNumber, 10);
    if (isNaN(roll) || roll < 1 || roll > MAX_ROLL) {
      return res.status(400).json({ message: "Invalid roll number" });
    }
    const date = getDate(req);
    const result = await Attendance.deleteOne({
      user: req.user._id,
      classId: group.classId,
      section: group.section,
      date,
      rollNumber: roll,
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "No attendance record found for this roll on this date" });
    }
    res.json({ message: "Attendance record removed", deleted: result.deletedCount });
  } catch (err) {
    console.error("Delete attendance error:", err.message);
    res.status(500).json({ message: "Failed to delete attendance" });
  }
});

router.post("/batch", async (req, res) => {
  try {
    const { error, group } = await authorizeGroup(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0 || records.length > MAX_ROLL) {
      return res.status(400).json({ message: "records must be a non-empty array" });
    }
    const date = getDate(req);

    const existing = await Attendance.find({ user: req.user._id, classId: group.classId, section: group.section, date }).select("rollNumber -_id");
    const existingRolls = new Set(existing.map((r) => r.rollNumber));

    const docs = [];
    for (const r of records) {
      const roll = parseInt(r.rollNumber, 10);
      if (isNaN(roll) || roll < 1 || roll > MAX_ROLL) continue;
      if (r.status !== "Present" && r.status !== "Absent") continue;
      if (existingRolls.has(roll)) continue;
      docs.push({ user: req.user._id, classId: group.classId, section: group.section, rollNumber: roll, date, status: r.status });
    }

    let inserted = 0;
    if (docs.length) {
      const result = await Attendance.insertMany(docs, { ordered: false });
      inserted = result.length;
    }
    res.status(201).json({ message: `Marked ${inserted} records`, inserted, duplicate: records.length - docs.length });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({ message: "Some records were duplicates and were skipped", inserted: 0 });
    }
    console.error("Batch attendance error:", err.message);
    res.status(500).json({ message: "Failed to batch mark attendance" });
  }
});

module.exports = router;
