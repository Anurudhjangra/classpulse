(function () {
  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("auth-error");
  let btn = document.getElementById("auth-btn");
  const sub = document.getElementById("auth-sub");
  const switchBtn = document.getElementById("switch-btn");
  const authCard = document.querySelector(".auth-card");

  let mode = "login";
  let pendingTarget = null;
  let pendingOtpTarget = null;
  let resetToken = null;
  let pendingDevOtp = null;
  let resendTimer = null;

  if (API.getToken()) window.location.href = "./dashboard.html";

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add("show");
  }

  function clearError() {
    errorBox.classList.remove("show");
  }

  function showInfo(msg) {
    errorBox.classList.remove("show");
    let info = document.getElementById("auth-info");
    if (!info) {
      info = document.createElement("div");
      info.id = "auth-info";
      info.className = "auth-info";
      authCard.insertBefore(info, form);
    }
    info.textContent = msg;
    info.classList.add("show");
  }

  function hideInfo() {
    const info = document.getElementById("auth-info");
    if (info) info.classList.remove("show");
  }

  function showDevOtp() {
    hideDevOtp();
    const box = document.createElement("div");
    box.id = "auth-dev-otp";
    box.className = "auth-dev-otp";
    box.textContent = "DEV MODE: OTP = " + pendingDevOtp + " (For real SMS, set SMS_API_KEY in .env)";
    authCard.insertBefore(box, form);
  }

  function hideDevOtp() {
    const box = document.getElementById("auth-dev-otp");
    if (box) box.remove();
  }

  const FIELDS = {
    login: [
      { id: "f-email", label: "Email", type: "email", placeholder: "you@school.com", autocomplete: "email" },
      { id: "f-password", label: "Password", type: "password", placeholder: "••••••••", autocomplete: "current-password" },
    ],
    signup: [
      { id: "f-name", label: "Full Name", type: "text", placeholder: "Ms. Sharma", autocomplete: "name" },
      { id: "f-email", label: "Email", type: "email", placeholder: "you@school.com", autocomplete: "email" },
      { id: "f-mobile", label: "Mobile Number", type: "tel", placeholder: "9876543210", autocomplete: "tel", maxlength: 10, hint: "OTP for password reset will be sent to this number" },
      { id: "f-password", label: "Password", type: "password", placeholder: "min 6 characters", autocomplete: "new-password" },
    ],
    forgot: [
      { id: "f-target", label: "Email or Mobile Number", type: "text", placeholder: "you@school.com or 9876543210" },
    ],
    otp: [
      { id: "f-otp", label: "Enter OTP", type: "text", placeholder: "6-digit OTP", maxlength: 6 },
    ],
    reset: [
      { id: "f-newPassword", label: "New Password", type: "password", placeholder: "min 6 characters", autocomplete: "new-password" },
      { id: "f-confirm", label: "Confirm New Password", type: "password", placeholder: "retype password", autocomplete: "new-password" },
    ],
  };

  const MODE_META = {
    login: { sub: "Sign in to your teacher account", btn: "Sign In", switch: "Don't have an account? Create account", info: null },
    signup: { sub: "Create your teacher account", btn: "Create Account", switch: "Already have an account? Sign in", info: null },
    forgot: { sub: "Forgot password", btn: "Send OTP", switch: "Back to login", info: null },
    otp: { sub: "OTP verification", btn: "Verify OTP", switch: "Back to login", info: null },
    reset: { sub: "Set new password", btn: "Update Password", switch: "Back to login", info: null },
  };

  function render() {
    clearError();
    hideInfo();
    hideDevOtp();
    sub.textContent = MODE_META[mode].sub;
    switchBtn.textContent = MODE_META[mode].switch;
    switchBtn.style.display = mode === "login" || mode === "signup" ? "" : "none";

    const fieldsHtml = FIELDS[mode]
      .map(
        (f) =>
          '<div class="field"><label for="' + f.id + '">' + f.label + "</label>" +
          '<input class="input" type="' + f.type + '" id="' + f.id + '" placeholder="' + f.placeholder + '"' +
          (f.maxlength ? ' maxlength="' + f.maxlength + '"' : "") +
          (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : "") +
          ' required />' +
          (f.hint ? '<small class="field-hint">' + f.hint + "</small>" : "") +
          "</div>"
      )
      .join("");

    const forgotHtml =
      mode === "login"
        ? '<div class="auth-links"><button type="button" class="forgot-link" id="forgot-btn">Forgot password?</button></div>'
        : "";

    const resendHtml =
      mode === "otp"
        ? '<button type="button" class="resend-link" id="resend-btn">Resend OTP</button>'
        : "";

    form.innerHTML =
      fieldsHtml +
      forgotHtml +
      resendHtml +
      '<button class="btn btn-primary btn-block" type="submit" id="auth-btn">' +
      MODE_META[mode].btn +
      "</button>";

    btn = document.getElementById("auth-btn");

    const forgotBtn = document.getElementById("forgot-btn");
    if (forgotBtn) forgotBtn.addEventListener("click", () => setMode("forgot"));

    const resend = document.getElementById("resend-btn");
    if (resend) {
      resend.addEventListener("click", () => forgotFlow(false));
      if (resendTimer) startResendTimer();
    }
    if (mode === "otp" && pendingDevOtp) showDevOtp();
  }

  function setMode(m) {
    mode = m;
    pendingDevOtp = null;
    render();
  }

  function startResendTimer() {
    const r = document.getElementById("resend-btn");
    if (!r) return;
    let s = 30;
    r.disabled = true;
    const tick = () => {
      r.textContent = "Resend OTP (" + s + "s)";
      if (s <= 0) {
        r.disabled = false;
        r.textContent = "Resend OTP";
        clearInterval(resendTimer);
      }
      s--;
    };
    tick();
    clearInterval(resendTimer);
    resendTimer = setInterval(tick, 1000);
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  async function forgotFlow(showMsg) {
    const target = pendingTarget || val("f-target");
    if (!target) {
      showError("Enter your email or mobile number");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Sending OTP...";
    try {
      const data = await API.post("/auth/forgot", { target });
      pendingTarget = target;
      pendingOtpTarget = data.otpTarget || (data.mobile || target);
      pendingDevOtp = data.devOtp || null;
      mode = "otp";
      render();
      showInfo(data.message + (data.dev ? " (dev mode)" : ""));
      startResendTimer();
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = MODE_META[mode].btn;
    }
  }

  switchBtn.addEventListener("click", () => {
    const next = mode === "login" ? "signup" : "login";
    mode = next;
    render();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    btn.disabled = true;

    if (mode === "login") {
      const email = val("f-email");
      const password = val("f-password");
      if (!email || !password) return finishError("Please fill in all fields");
      btn.textContent = "Signing in...";
      try {
        const data = await API.post("/auth/login", { email, password });
        API.setSession(data.token, data.user);
        toast("Welcome back!", "good");
        setTimeout(() => (window.location.href = "./dashboard.html"), 300);
      } catch (err) {
        finishError(err.message);
      }
    } else if (mode === "signup") {
      const name = val("f-name");
      const email = val("f-email");
      const mobile = val("f-mobile");
      const password = val("f-password");
      if (!name || !email || !password) return finishError("Please fill in all fields");
      if (mobile && !/^[6-9]\d{9}$/.test(mobile)) return finishError("Enter a valid 10-digit mobile number");
      if (password.length < 6) return finishError("Password must be at least 6 characters");
      btn.textContent = "Creating...";
      try {
        const data = await API.post("/auth/signup", { name, email, mobile, password });
        API.setSession(data.token, data.user);
        toast("Account created! Welcome 🎉", "good");
        setTimeout(() => (window.location.href = "./dashboard.html"), 300);
      } catch (err) {
        finishError(err.message);
      }
    } else if (mode === "forgot") {
      forgotFlow(true);
    } else if (mode === "otp") {
      const otp = val("f-otp");
      if (!otp) return finishError("Enter the OTP");
      btn.textContent = "Verifying...";
      try {
        const data = await API.post("/auth/verify-otp", { target: pendingOtpTarget, otp });
        resetToken = data.resetToken;
        mode = "reset";
        render();
        showInfo("OTP verified. Set your new password.");
      } catch (err) {
        finishError(err.message);
      }
    } else if (mode === "reset") {
      const p1 = val("f-newPassword");
      const p2 = val("f-confirm");
      if (!p1 || !p2) return finishError("Please fill in all fields");
      if (p1.length < 6) return finishError("Password must be at least 6 characters");
      if (p1 !== p2) return finishError("Passwords do not match");
      btn.textContent = "Updating...";
      try {
        await API.post("/auth/reset-password", { resetToken, newPassword: p1 });
        resetToken = null;
        mode = "login";
        render();
        showInfo("Password updated. Please login with your new password.");
      } catch (err) {
        finishError(err.message);
      }
    }
  });

  function finishError(msg) {
    showError(msg);
    btn.disabled = false;
    btn.textContent = MODE_META[mode].btn;
  }

  render();
})();
