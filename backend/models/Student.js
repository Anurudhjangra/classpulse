const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    section: { type: String, required: true, trim: true, uppercase: true },
    rollNumber: { type: Number, required: true, min: 1, max: 999 },
    name: { type: String, default: "", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "students" }
);

studentSchema.index({ owner: 1, classId: 1, section: 1, rollNumber: 1 }, { unique: true });
studentSchema.index({ owner: 1, classId: 1, section: 1 });

module.exports = mongoose.model("Student", studentSchema);
