const crypto = require("crypto");

function isSmsConfigured() {
  return !!(process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
}

function sendOtp(mobile, otp) {
  if (!isSmsConfigured()) {
    console.log(`[DEV-OTP] Mobile ${mobile} -> OTP: ${otp}`);
    return Promise.resolve({ delivered: false, dev: true });
  }
  const provider = (process.env.SMS_PROVIDER || "fast2sms").toLowerCase();
  if (provider === "fast2sms") {
    return fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: process.env.SMS_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        route: "otp",
        variables_values: otp,
        numbers: mobile,
      }),
    }).then(async (r) => ({ delivered: r.ok, status: r.status }));
  }
  if (provider === "msg91") {
    return fetch(
      `https://api.msg91.com/api/v5/otp?template_id=${process.env.SMS_TEMPLATE_ID}&mobile=${mobile}&otp=${otp}&authkey=${process.env.SMS_API_KEY}`
    ).then(async (r) => ({ delivered: r.ok, status: r.status }));
  }
  return Promise.resolve({ delivered: false, dev: true, message: "Unknown provider" });
}

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

module.exports = { sendOtp, generateOtp, isSmsConfigured };
