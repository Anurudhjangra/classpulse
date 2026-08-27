const express = require("express");
const Student = require("../models/Student");
const Class = require("../models/Class");
const auth = require("../middleware/auth");
const { MAX_ROLL } = require("../config/constants");
const { ensureRosterForSection } = require("../utils/roster");

const router = express.Router();

router.use(auth);

function validId(id) {
  return /^[0-9a-fA-F]{24}$/.test(String(id || ""));
}

router.get("/", async (req, res) => {
  try {
    const { search, classId, section, limit = 300 } = req.query;
    const filter = { owner: req.user._id };

    if (!classId || !section) {
      return res.status(400).json({ message: "classId and section are required" });
    }
    if (!validId(classId)) return res.status(400).json({ message: "Invalid classId" });

    filter.classId = classId;
    filter.section = String(section).toUpperCase();

    if (search && search.trim()) {
      const num = parseInt(search.trim(), 10);
      const nameQuery = { $regex: search.trim(), $options: "i" };
      if (!isNaN(num)) {
        filter.$or = [{ rollNumber: num }, { name: nameQuery }];
      } else {
        filter.name = nameQuery;
      }
    }

    const [total, students] = await Promise.all([
      Student.countDocuments(filter),
      Student.find(filter).sort({ rollNumber: 1 }).limit(parseInt(limit, 10)),
    ]);

    res.json({ total, students });
  } catch (err) {
    console.error("List students error:", err.message);
    res.status(500).json({ message: "Failed to load students" });
  }
});

router.put("/:rollNumber", async (req, res) => {
  try {
    const rollNumber = parseInt(req.params.rollNumber, 10);
    if (rollNumber < 1 || rollNumber > MAX_ROLL) {
      return res.status(400).json({ message: `Roll number must be between 1 and ${MAX_ROLL}` });
    }
    const { name, classId, section } = req.body;
    if (!validId(classId) || !section) {
      return res.status(400).json({ message: "classId and section are required" });
    }
    if (typeof name !== "string" || name.trim().length > 60) {
      return res.status(400).json({ message: "Name must be a string up to 60 characters" });
    }

    const student = await Student.findOneAndUpdate(
      { owner: req.user._id, classId, section: String(section).toUpperCase(), rollNumber },
      { $set: { name: name.trim() } },
      { new: true, upsert: true }
    );
    res.json({ message: "Student updated", student });
  } catch (err) {
    console.error("Update student error:", err.message);
    res.status(500).json({ message: "Failed to update student" });
  }
});

router.post("/ensure", async (req, res) => {
  try {
    const { classId, section } = req.body;
    if (!validId(classId) || !section) {
      return res.status(400).json({ message: "classId and section are required" });
    }
    const cls = await Class.findOne({ owner: req.user._id, _id: classId });
    if (!cls) return res.status(404).json({ message: "Class not found" });

    const inserted = await ensureRosterForSection({
      owner: req.user._id,
      classId,
      section: String(section).toUpperCase(),
    });
    res.json({ message: "Roster ensured", inserted });
  } catch (err) {
    console.error("Ensure students error:", err.message);
    res.status(500).json({ message: "Failed to ensure student roster" });
  }
});

module.exports = router;
