require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { execFile } = require("child_process");
const chatRouter = require("./routes/chat");
const authRouter = require("./routes/auth");
const sessionsRouter = require("./routes/sessions");
const skillsRouter = require("./routes/skills");
const storeRouter = require("./routes/store");
const filesRouter = require("./routes/files");
const { requireAuth } = require("./middleware/auth");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";

// Cache Claude version at startup, retry once on first /api/version hit if missed
let claudeVersion = null;
let versionFetching = false;
const versionWaiters = [];

function fetchVersion() {
  if (versionFetching) return;
  versionFetching = true;
  execFile(CLAUDE_PATH, ["--version"], { timeout: 5000 }, (err, stdout) => {
    if (!err) claudeVersion = stdout.trim();
    console.log(`Claude version: ${claudeVersion || "unavailable"}`);
    versionWaiters.forEach((cb) => cb());
    versionWaiters.length = 0;
    versionFetching = false;
  });
}

fetchVersion();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
  : ["http://localhost:5173"];

// Request ID — attaches to every request for log correlation
function requestId(req, _res, next) {
  req.id = crypto.randomUUID().slice(0, 8);
  next();
}

morgan.token("id", (req) => req.id);

app.use(requestId);
app.use(morgan(":id :method :url :status :response-time ms"));
app.use(helmet({
  contentSecurityPolicy: false, // SSE requires relaxed CSP; Nginx handles this
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
}));
app.use(express.json({ limit: "10mb" }));

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 60000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "请求过于频繁，请稍后重试" },
});

const authLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "登录/注册过于频繁，请稍后重试" },
});

const chatLimiter = rateLimit({
  windowMs: 60000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "请求过于频繁，请稍后重试" },
});

const skillsLimiter = rateLimit({
  windowMs: 60000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "请求过于频繁，请稍后重试" },
});

// Public routes
app.get("/api/health", generalLimiter, (_req, res) => {
  res.json({
    status: "ok",
    claude: claudeVersion || "unavailable",
  });
});

app.get("/api/version", generalLimiter, (_req, res) => {
  if (claudeVersion) return res.json({ version: claudeVersion });
  if (!versionFetching) fetchVersion();
  versionWaiters.push(() => {
    res.json({ version: claudeVersion || "unknown" });
  });
});

// Auth routes (public, rate-limited)
app.use("/api/auth", authLimiter, authRouter);

// Protected routes — each mounted at its own prefix so middleware is isolated
app.use("/api/chat", requireAuth, chatLimiter, chatRouter);
app.use("/api/sessions", requireAuth, sessionsRouter);
app.use("/api/skills", requireAuth, skillsLimiter, skillsRouter);
app.use("/api/store", requireAuth, skillsLimiter, storeRouter);
app.use("/api/files", requireAuth, skillsLimiter, filesRouter);

// Global error handler
app.use((err, req, res, _next) => {
  const reqId = req.id || "?";
  console.error(`[error] [${reqId}]`, err.stack || err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
});

const server = app.listen(PORT, "::1", () => {
  console.log(`Server running on http://[::1]:${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);
  const forceExit = setTimeout(() => {
    console.error("[shutdown] Forcing exit after timeout.");
    process.exit(1);
  }, 15000);
  server.close(() => {
    clearTimeout(forceExit);
    console.log("[shutdown] All connections closed.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
