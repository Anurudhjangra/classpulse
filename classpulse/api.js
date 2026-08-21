const API = (() => {
  const TOKEN_KEY = "att_token";
  const USER_KEY = "att_user";

  const setSession = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  };

  const GROUP_KEY = "att_group";
  const getGroup = () => {
    try {
      return JSON.parse(localStorage.getItem(GROUP_KEY) || "null");
    } catch {
      return null;
    }
  };
  const setGroup = (g) => localStorage.setItem(GROUP_KEY, JSON.stringify(g));

  const API_BASE = (() => {
    if (location.protocol === "file:") {
      const port = window.API_PORT || 5000;
      return "http://localhost:" + port + "/api";
    }
    return "/api";
  })();

  const requireAuth = () => {
    if (!getToken()) {
      window.location.href = "./index.html";
    }
  };

  const logout = () => {
    clearSession();
    window.location.href = "./index.html";
  };

  async function request(path, options = {}, retries = 1) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;

    let res;
    try {
      res = await fetch(API_BASE + path, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (networkErr) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return request(path, options, retries - 1);
      }
      if (networkErr.name === "TypeError" && networkErr.message === "Failed to fetch") {
        const err = new Error("Cannot connect to server. Is the server running? Check localhost:5000");
        err.status = 0;
        throw err;
      }
      throw networkErr;
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { message: res.statusText };
    }

    if (res.status === 401) {
      if (token) {
        clearSession();
        window.location.href = "./index.html";
        throw new Error("Session expired. Please login again.");
      }
      const err = new Error(data.message || "Invalid credentials");
      err.status = res.status;
      err.data = data;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(data.message || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const get = (path, options) => request(path, { ...options, method: "GET" });
  const post = (path, body, options) => request(path, { ...options, method: "POST", body });
  const put = (path, body, options) => request(path, { ...options, method: "PUT", body });
  const del = (path, options) => request(path, { ...options, method: "DELETE" });

  return { setSession, clearSession, getToken, getUser, getGroup, setGroup, requireAuth, logout, get, post, put, del, checkServer: () => request("/health").catch(() => null) };
})();

function toast(message, type = "info", ms = 2200) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = "toast " + type;
  const icon = type === "good" ? "✔" : type === "bad" ? "✖" : "ℹ";
  el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
