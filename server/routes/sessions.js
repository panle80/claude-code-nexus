const { Router } = require("express");
const fs = require("fs/promises");
const path = require("path");
const {
  genId,
  sessionsDir,
  sessionFile,
  ensureSessionsDirAsync,
  appendMessages: appendToSession,
  validateSessionId,
  resolveSessionPath,
  parseJsonlAsync,
  fileLock,
} = require("../utils");

const router = Router();

function titlesFile(username) {
  return path.join(sessionsDir(username), "titles.json");
}

async function loadTitles(username) {
  try {
    const fp = titlesFile(username);
    const raw = await fs.readFile(fp, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("[sessions] Failed to load titles for", username, ":", err.code || err.message);
    }
    return {};
  }
}

async function saveTitle(username, sessionId, title) {
  const fp = titlesFile(username);
  const unlock = await fileLock(fp);
  try {
    const titles = await loadTitles(username);
    if (title) {
      titles[sessionId] = title;
    } else {
      delete titles[sessionId];
    }
    await fs.writeFile(fp, JSON.stringify(titles), "utf-8");
  } finally {
    unlock();
  }
}

async function readFirstUserLine(filePath) {
  try {
    const fh = await fs.open(filePath, "r");
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(buf, 0, 4096, 0);
    await fh.close();

    const raw = buf.toString("utf-8", 0, bytesRead);
    const firstLine = raw.split("\n").find((line) => {
      try {
        return JSON.parse(line).role === "user";
      } catch {
        return false;
      }
    });
    if (firstLine) {
      const msg = JSON.parse(firstLine);
      return msg.content.slice(0, 80) || "新对话";
    }
  } catch {
    return null;
  }
}

function requireValidSession(req, res, next) {
  const sessionId = req.params.id || "";

  if (!validateSessionId(sessionId)) {
    return res.status(400).json({ error: "会话 ID 格式不正确" });
  }

  const resolved = resolveSessionPath(req.user.username, sessionId);
  if (!resolved) {
    return res.status(400).json({ error: "会话 ID 无效" });
  }

  req.sessionResolved = resolved;
  req.sessionId = sessionId;
  next();
}

// List sessions
router.get("/", async (req, res) => {
  try {
    const username = req.user.username;
    await ensureSessionsDirAsync(username);
    const dir = sessionsDir(username);

    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
    const titles = await loadTitles(username);

    const entries = await Promise.all(
      files.map(async (f) => {
        const filePath = path.join(dir, f);
        const stat = await fs.stat(filePath);
        const sessionId = f.replace(/\.jsonl$/, "");
        const title = titles[sessionId] || null;

        let preview = title || "新对话";
        if (!title) {
          const first = await readFirstUserLine(filePath);
          if (first) preview = first;
        }

        return {
          id: sessionId,
          preview,
          title,
          createdAt: stat.mtime.toISOString(),
        };
      }),
    );

    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ sessions: entries });
  } catch (err) {
    res.status(500).json({ error: `列出会话失败：${err.message}` });
  }
});

// Create session
router.post("/", async (req, res) => {
  try {
    const username = req.user.username;
    await ensureSessionsDirAsync(username);

    const sessionId = genId();
    const filePath = sessionFile(username, sessionId);

    await fs.writeFile(filePath, "", "utf-8");
    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: `创建会话失败：${err.message}` });
  }
});

// Get session messages
router.get("/:id", requireValidSession, async (req, res) => {
  try {
    const messages = await parseJsonlAsync(req.sessionResolved);
    res.json({ sessionId: req.sessionId, messages });
  } catch {
    res.status(500).json({ error: "加载会话失败" });
  }
});

// Update session title
router.put("/:id/title", requireValidSession, async (req, res) => {
  try {
    const { title } = req.body || {};

    if (typeof title !== "string" || title.length > 200) {
      return res.status(400).json({ error: "标题格式不正确（1-200 字符）" });
    }

    try {
      await fs.access(req.sessionResolved, fs.constants.F_OK);
    } catch {
      return res.status(404).json({ error: "会话不存在" });
    }

    await ensureSessionsDirAsync(req.user.username);
    await saveTitle(req.user.username, req.sessionId, title.trim() || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `更新标题失败：${err.message}` });
  }
});

// Delete session
router.delete("/:id", requireValidSession, async (req, res) => {
  try {
    await fs.unlink(req.sessionResolved).catch(() => {});
    await saveTitle(req.user.username, req.sessionId, null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `删除会话失败：${err.message}` });
  }
});

// Append messages to session
router.post("/:id/messages", requireValidSession, async (req, res) => {
  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages 必须是非空数组" });
    }

    for (const msg of messages) {
      if (!msg || typeof msg !== "object") {
        return res.status(400).json({ error: "每条消息必须是对象" });
      }
      if (!["user", "assistant"].includes(msg.role)) {
        return res.status(400).json({ error: "消息角色无效" });
      }
      if (typeof msg.content !== "string" || msg.content.length === 0) {
        return res.status(400).json({ error: "消息内容不能为空" });
      }
      if (msg.content.length > 100000) {
        return res.status(400).json({ error: "消息内容过长" });
      }
    }

    try {
      await fs.access(req.sessionResolved, fs.constants.F_OK);
    } catch {
      return res.status(404).json({ error: "会话不存在" });
    }

    await appendToSession(req.user.username, req.sessionId, messages);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `保存消息失败：${err.message}` });
  }
});

module.exports = router;
