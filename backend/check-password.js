require("dotenv").config();
const connectDB = require("./config/db");
const User = require("./models/User");

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log("Usage: node check-password.js <email> <password>");
  console.log("Example: node check-password.js teacher@demo.com demo123");
  process.exit(1);
}

(async () => {
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.log("User not found: " + email);
    process.exit(1);
  }
  console.log("Found user: " + user.name + " (" + user.email + ")");
  console.log("Stored hash: " + String(user.password).substring(0, 40) + "...");
  const ok = await user.matchPassword(password);
  console.log("Password '" + password + "' is " + (ok ? "CORRECT ✓" : "WRONG ✗"));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });