const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    sections: [{ type: String, trim: true, uppercase: true }],
    rollRanges: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "classes" }
);

classSchema.index({ owner: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Class", classSchema);
