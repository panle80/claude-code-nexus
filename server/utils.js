const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_ROOT = process.env.USER_DATA_ROOT || path.join(__dirname, "..", "data", "users");
const STORE_DIR = path.join(path.dirname(DATA_ROOT), "skills-store");

const SESSION_ID_RE = /^[a-z0-9]+$/i;
const SKILL_NAME_RE = /^[a-z][a-z0-9-]*$/i;

function safeResolve(base, rel) {
  const normalizedRel = rel.replace(/\\/g, "/");
  const resolved = path.resolve(base, normalizedRel);
  const a = resolved.replace(/\\/g, "/").toLowerCase();
  const b = base.replace(/\\/g, "/").toLowerCase();
  if (!a.startsWith(b + "/") && a !== b) return null;
  return resolved;
}

function genId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

function userDir(username) {
  return path.join(DATA_ROOT, username);
}

function workspaceDir(username) {
  return path.join(DATA_ROOT, username, "workspace");
}

function homeDir(username) {
  return path.join(DATA_ROOT, username, "home");
}

function tmpDir(username) {
  return path.join(DATA_ROOT, username, "tmp");
}

function sessionsDir(username) {
  return path.join(DATA_ROOT, username, "sessions");
}

function skillsDir(username) {
  return path.join(DATA_ROOT, username, "home", ".claude", "skills");
}

function storeDir() {
  return STORE_DIR;
}

function sessionFile(username, sessionId) {
  return path.join(sessionsDir(username), `${sessionId}.jsonl`);
}

function ensureSessionsDir(username) {
  const dir = sessionsDir(username);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

async function ensureSessionsDirAsync(username) {
  const dir = sessionsDir(username);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
}

function validateSessionId(sessionId) {
  return SESSION_ID_RE.test(sessionId);
}

function validateSkillName(name) {
  return SKILL_NAME_RE.test(name);
}

function resolveSkillPath(username, name) {
  return safeResolve(skillsDir(username), name);
}

function resolveSessionPath(username, sessionId) {
  return safeResolve(sessionsDir(username), sessionId + ".jsonl");
}

// Per-file mutex to prevent concurrent writes from corrupting JSONL/titles
const _locks = new Map();
function fileLock(key) {
  if (!_locks.has(key)) _locks.set(key, Promise.resolve());
  let release;
  const prev = _locks.get(key);
  _locks.set(key, prev.then(() => new Promise((r) => { release = r; })));
  return prev.then(() => release);
}

async function appendMessages(username, sessionId, msgs) {
  await ensureSessionsDirAsync(username);
  const resolved = resolveSessionPath(username, sessionId);
  if (!resolved) return;
  const lines = msgs.map((m) => JSON.stringify({ ...m, timestamp: Date.now() })).join("\n") + "\n";
  const unlock = await fileLock(resolved);
  try {
    await fs.promises.appendFile(resolved, lines, "utf-8");
  } finally {
    unlock();
  }
}

function parseJsonlString(raw) {
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function parseJsonlAsync(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return parseJsonlString(raw);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("[utils] parseJsonlAsync error:", err.code || err.message);
    }
    return [];
  }
}

module.exports = {
  DATA_ROOT,
  safeResolve,
  genId,
  userDir,
  workspaceDir,
  homeDir,
  sessionsDir,
  sessionFile,
  ensureSessionsDirAsync,
  validateSessionId,
  resolveSessionPath,
  skillsDir,
  tmpDir,
  storeDir,
  validateSkillName,
  resolveSkillPath,
  appendMessages,
  parseJsonlString,
  parseJsonlAsync,
  fileLock,
};
