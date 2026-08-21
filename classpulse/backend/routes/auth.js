const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Class = require("../models/Class");
const Otp = require("../models/Otp");
const auth = require("../middleware/auth");
const { createRosterForSection } = require("../utils/roster");
const { sendOtp, generateOtp, isSmsConfigured } = require("../utils/sms");

const router = express.Router();

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || "7d",
  });

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, mobile } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    const mobileRegex = /^[6-9]\d{9}$/;
    if (mobile && !mobileRegex.test(mobile)) {
      return res.status(400).json({ message: "Invalid mobile number (10 digits, starting 6-9)" });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    if (mobile) {
      const mExists = await User.findOne({ mobile });
      if (mExists) {
        return res.status(409).json({ message: "An account with this mobile number already exists" });
      }
    }

    const user = await User.create({ name, email, password, mobile: mobile || "" });

    const cls = await Class.create({
      owner: user._id,
      name: "Class 10",
      sections: ["A"],
    });
    await createRosterForSection({ owner: user._id, classId: cls._id, section: "A" });

    res.status(201).json({
      message: "Account created",
      token: generateToken(user._id),
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ message: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({
      message: "Login successful",
      token: generateToken(user._id),
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/forgot", async (req, res) => {
  try {
    const { target } = req.body;
    if (!target) {
      return res.status(400).json({ message: "Email or mobile number is required" });
    }
    const isMobile = /^[6-9]\d{9}$/.test(target);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target);
    if (!isMobile && !isEmail) {
      return res.status(400).json({ message: "Enter a valid email or mobile number" });
    }

    const user = isMobile
      ? await User.findOne({ mobile: target })
      : await User.findOne({ email: target.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "No account found with this " + (isMobile ? "mobile number" : "email") });
    }

    const otp = generateOtp();
    const targetKey = isMobile ? target : user.mobile || target.toLowerCase();
    await Otp.deleteMany({ target: targetKey, purpose: "reset" });
    await Otp.create({
      target: targetKey,
      otp,
      purpose: "reset",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const delivery = isMobile ? await sendOtp(target, otp) : { dev: false, delivered: false, noMobile: !user.mobile };

    const dev = !isSmsConfigured();
    res.json({
      message: isMobile
        ? "OTP sent to your mobile number"
        : delivery.noMobile
          ? "No mobile number linked. Enter your mobile number instead."
          : "Enter your mobile number to receive OTP",
      devOtp: dev && isMobile ? otp : undefined,
      dev,
      mobile: isMobile ? target : user.mobile || null,
      otpTarget: targetKey,
    });
  } catch (err) {
    console.error("Forgot error:", err.message);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { target, otp } = req.body;
    if (!target || !otp) {
      return res.status(400).json({ message: "Mobile number and OTP are required" });
    }
    const record = await Otp.findOne({ target, purpose: "reset" });
    if (!record) {
      return res.status(400).json({ message: "OTP expired. Request a new one" });
    }
    if (String(record.otp) !== String(otp).trim()) {
      return res.status(400).json({ message: "Incorrect OTP. Try again" });
    }
    await Otp.deleteOne({ _id: record._id });
    const resetToken = jwt.sign({ purpose: "reset", target }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    res.json({ message: "OTP verified", resetToken });
  } catch (err) {
    console.error("Verify OTP error:", err.message);
    res.status(500).json({ message: "OTP verification failed" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: "Reset token and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "Invalid or expired reset link. Start again" });
    }
    if (payload.purpose !== "reset") {
      return res.status(400).json({ message: "Invalid reset token" });
    }
    const target = payload.target;
    const user = await User.findOne({ $or: [{ email: target.toLowerCase() }, { mobile: target }] });
    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: "Password updated. Please login with your new password" });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ message: "Password reset failed" });
  }
});

router.get("/me", auth, (req, res) => {
  res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, mobile: req.user.mobile || "" } });
});

module.exports = router;
