const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    section: { type: String, required: true, trim: true, uppercase: true },
    rollNumber: { type: Number, required: true, min: 1, max: 999 },
    date: { type: String, required: true },
    status: { type: String, enum: ["Present", "Absent"], required: true },
    markedAt: { type: Date, default: Date.now },
  },
  { collection: "attendance" }
);

attendanceSchema.index({ user: 1, classId: 1, section: 1, date: 1, rollNumber: 1 }, { unique: true });
attendanceSchema.index({ user: 1, classId: 1, section: 1, date: 1 });
attendanceSchema.index({ user: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
