const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    target: { type: String, required: true },
    otp: { type: String, required: true },
    purpose: { type: String, default: "reset" },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "otps" }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);
