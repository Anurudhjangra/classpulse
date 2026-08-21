const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGIN || true)
    : true,
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl} origin=${req.headers.origin || "-"} ref=${req.headers.referer || "-"}`);
  next();
});

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: Date.now() }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/classes", require("./routes/classes"));
app.use("/api/students", require("./routes/students"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/reports", require("./routes/reports"));

const rootDir = path.join(__dirname, "..");

const BLOCKED = /^\/(backend|node_modules|\.git)(\/|$)|^\/(\.env|\.env\..*|\.gitignore|README\.md|render\.yaml|start\.bat|start-online\.bat|server\.(err|out)\.log)$/i;
app.use((req, res, next) => {
  if (BLOCKED.test(req.path)) {
    return res.status(404).json({ message: "Not found" });
  }
  next();
});

app.use(
  express.static(rootDir, {
    index: "index.html",
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  })
);

app.get("/", (req, res) => res.sendFile(path.join(rootDir, "index.html")));

app.use("/api", (req, res) =>
  res.status(404).json({ message: "API route not found" })
);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
