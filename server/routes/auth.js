const { Router } = require("express");
const bcrypt = require("bcryptjs");
const fs = require("fs/promises");
const path = require("path");
const { signToken, requireAuth } = require("../middleware/auth");
const { DATA_ROOT, userDir, workspaceDir, homeDir, tmpDir } = require("../utils");

const router = Router();

const BCRYPT_ROUNDS = 10;

const ANTHROPIC_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
];

let _dummyHash = null;
function getDummyHash() {
  if (!_dummyHash) {
    _dummyHash = bcrypt.hashSync("__dummy__", BCRYPT_ROUNDS);
  }
  return _dummyHash;
}

const USERNAME_RE = /^[a-zA-Z0-9_一-鿿]{2,32}$/;

function passwordFile(username) {
  return userDir(username) + "/.password";
}

async function ensureUserDirs(username) {
  const dirs = [workspaceDir(username), homeDir(username)];
  for (const d of dirs) {
    await fs.mkdir(d, { recursive: true, mode: 0o700 });
  }

  await fs.mkdir(path.join(homeDir(username), ".claude", "skills"), { recursive: true, mode: 0o700 });
  await fs.mkdir(tmpDir(username), { recursive: true, mode: 0o700 });

  // Ensure API credentials are available in the user's home .claude/ directory
  const envVars = {};
  for (const key of ANTHROPIC_KEYS) {
    if (process.env[key]) envVars[key] = process.env[key];
  }
  if (Object.keys(envVars).length === 0) return;

  const claudeDir = path.join(homeDir(username), ".claude");
  const settingsFile = path.join(claudeDir, "settings.json");

  try {
    await fs.mkdir(claudeDir, { recursive: true, mode: 0o700 });
    // Don't overwrite existing settings.json — a user may have customised it
    await fs.writeFile(settingsFile, JSON.stringify({ env: envVars }, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (e) {
    if (e.code !== "EEXIST") {
      console.error("[auth] Failed to create settings.json for", username, ":", e.message);
    }
  }
}

router.post("/register", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || typeof username !== "string" || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "用户名格式不正确（2-32 位字母、数字、下划线或中文）" });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "密码至少 8 位" });
  }

  const dir = userDir(username);
  const pwFile = passwordFile(username);

  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    // Create workspace/home dirs before writing password — avoids broken state on failure
    await ensureUserDirs(username);
    // Use exclusive write to prevent TOCTOU race — fails if file already exists
    try {
      await fs.writeFile(pwFile, hash, { mode: 0o600, flag: "wx" });
    } catch (e) {
      if (e.code === "EEXIST") {
        return res.status(409).json({ error: "该用户名已被注册" });
      }
      throw e;
    }

    const token = signToken({ username });
    return res.json({ token, username });
  } catch (err) {
    console.error("[auth] register error:", err.message);
    return res.status(500).json({ error: "注册失败" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "请填写用户名和密码" });
  }

  const pwFile = passwordFile(username);

  try {
    let hash;
    try {
      hash = await fs.readFile(pwFile, "utf-8");
    } catch {
      hash = getDummyHash();
    }

    const valid = await bcrypt.compare(password, hash);
    if (!valid || hash === getDummyHash()) {
      return res.status(401).json({ error: "用户名或密码错误" });
    }

    await ensureUserDirs(username);

    const token = signToken({ username });
    return res.json({ token, username });
  } catch (err) {
    console.error("[auth] login error:", err.message);
    return res.status(500).json({ error: "登录失败" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

module.exports = router;
