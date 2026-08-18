const mongoose = require("mongoose");
const User = require("./models/User");

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log("Usage: node check-password.js <email> <password>");
  console.log("Example: node check-password.js teacher@demo.com demo123");
  process.exit(1);
}

(async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/attendance_system");
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.log("User not found: " + email);
    process.exit(1);
  }
  console.log("Found user: " + user.name + " (" + user.email + ")");
  console.log("Stored hash: " + String(user.password).substring(0, 40) + "...");
  const ok = await user.matchPassword(password);
  console.log("Password '" + password + "' is " + (ok ? "CORRECT ✓" : "WRONG ✗"));
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
