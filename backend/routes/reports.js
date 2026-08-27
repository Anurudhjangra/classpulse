const express = require("express");
const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const auth = require("../middleware/auth");
const { todayStr, validateDateStr, monthRange } = require("../utils/date");

const router = express.Router();

router.use(auth);

function validId(id) {
  return /^[0-9a-fA-F]{24}$/.test(String(id || ""));
}

function buildDateFilter(query) {
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const { from, to } = monthRange(query.month);
    return { $gte: from, $lte: to };
  }
  if (query.from && query.to && validateDateStr(query.from) && validateDateStr(query.to)) {
    return { $gte: query.from, $lte: query.to };
  }
  if (query.from && validateDateStr(query.from)) {
    return { $gte: query.from };
  }
  if (query.to && validateDateStr(query.to)) {
    return { $lte: query.to };
  }
  return null;
}

router.get("/student-wise", async (req, res) => {
  try {
    const match = { user: req.user._id };

    if (req.query.classId || req.query.section) {
      if (!validId(req.query.classId) || !req.query.section) {
        return res.status(400).json({ message: "Invalid classId/section" });
      }
      match.classId = new mongoose.Types.ObjectId(req.query.classId);
      match.section = String(req.query.section).toUpperCase();
    }

    const dateFilter = buildDateFilter(req.query);
    if (dateFilter) match.date = dateFilter;
    if (req.query.roll) {
      const roll = parseInt(req.query.roll, 10);
      if (!isNaN(roll)) match.rollNumber = roll;
    }

    const agg = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$rollNumber",
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const statsMap = {};
    agg.forEach((r) => (statsMap[r._id] = r));

    const studentFilter = { owner: req.user._id };
    if (match.classId) {
      studentFilter.classId = match.classId;
      studentFilter.section = match.section;
    }
    const students = await Student.find(studentFilter).select("rollNumber name -_id");
    const nameMap = {};
    students.forEach((s) => (nameMap[s.rollNumber] = s.name));

    let rolls;
    if (match.classId) {
      rolls = students.map((s) => s.rollNumber).sort((a, b) => a - b);
      if (!rolls.length) rolls = agg.map((r) => r._id).sort((a, b) => a - b);
    } else {
      const set = new Set();
      agg.forEach((r) => set.add(r._id));
      students.forEach((s) => set.add(s.rollNumber));
      rolls = Array.from(set).sort((a, b) => a - b);
      if (!rolls.length) rolls = [1];
    }

    const report = [];
    for (const roll of rolls) {
      const s = statsMap[roll];
      const total = s ? s.total : 0;
      const present = s ? s.present : 0;
      const absent = s ? s.absent : 0;
      report.push({
        rollNumber: roll,
        name: nameMap[roll] || "",
        total,
        present,
        absent,
        percentage: total ? ((present / total) * 100).toFixed(1) : "0.0",
      });
    }

    if (req.query.roll) {
      const r = parseInt(req.query.roll, 10);
      return res.json({ report: report.filter((x) => x.rollNumber === r) });
    }

    res.json({ report });
  } catch (err) {
    console.error("Student-wise report error:", err.message);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const user = req.user._id;
    const today = todayStr();

    const [totalStudents, todayRecords, overallAgg, recentDays] = await Promise.all([
      Student.countDocuments({ owner: user }),
      Attendance.find({ user, date: today }).select("status -_id"),
      Attendance.aggregate([
        { $match: { user } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] } },
          },
        },
      ]),
      Attendance.aggregate([
        { $match: { user } },
        {
          $group: {
            _id: "$date",
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] } },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 7 },
      ]),
    ]);

    const overall = overallAgg[0] || { total: 0, present: 0 };
    const presentCount = todayRecords.filter((r) => r.status === "Present").length;
    const absentCount = todayRecords.filter((r) => r.status === "Absent").length;

    res.json({
      todayDate: today,
      totalStudents,
      todayMarked: todayRecords.length,
      todayPresent: presentCount,
      todayAbsent: absentCount,
      totalClasses: totalStudents > 0 ? Math.round(overall.total / totalStudents) : 0,
      overallTotal: overall.total,
      overallPresent: overall.present,
      overallAbsent: overall.total - overall.present,
      overallPercentage:
        overall.total > 0 ? ((overall.present / overall.total) * 100).toFixed(1) : "0.0",
      recentDays,
    });
  } catch (err) {
    console.error("Summary error:", err.message);
    res.status(500).json({ message: "Failed to load summary" });
  }
});

module.exports = router;
