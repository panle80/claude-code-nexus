const { Router } = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs/promises");
const {
  DATA_ROOT,
  genId,
  validateSessionId,
  resolveSessionPath,
  appendMessages,
  parseJsonlAsync,
  ensureSessionsDirAsync,
} = require("../utils");

const router = Router();

const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT || "600000", 10);
const MAX_PROMPT_LENGTH = 100000;
const MAX_STDOUT_BYTES = 50_000_000;  // cap total stdout to prevent runaway process (50MB for doc generation)
const MAX_CONTENT_LENGTH = 1_000_000; // cap text content specifically
const MAX_STDERR_BYTES = 500_000;   // cap stderr (unlikely to be large but guard anyway)

function debugLog(rid, msg) {
  console.log(`[chat] [${rid}] ${msg}`);
}

function buildPrompt(history, currentPrompt) {
  if (history.length === 0) return currentPrompt;

  const recent = history.length > 50 ? history.slice(-50) : history;

  let ctx = "[Previous conversation]\n\n";
  for (const msg of recent) {
    const content = (msg.content || "").replace(/^User: |^Claude: |^---/gm, "\\$&");
    if (msg.role === "user") ctx += "User: " + content + "\n\n";
    else if (msg.role === "assistant") ctx += "Claude: " + content + "\n\n";
  }
  ctx += "---\n" + currentPrompt;
  return ctx;
}

router.post("/", async (req, res) => {
  const rid = req.id || "?";
  const { prompt, sessionId } = req.body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "prompt is required" });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `prompt exceeds ${MAX_PROMPT_LENGTH / 1000}KB limit` });
  }

  const username = req.user.username;
  const sid = sessionId && validateSessionId(sessionId) ? sessionId : genId();

  await ensureSessionsDirAsync(username);

  let history = [];
  if (sessionId && validateSessionId(sessionId)) {
    const resolved = resolveSessionPath(username, sessionId);
    if (resolved) {
      history = await parseJsonlAsync(resolved);
    }
  }

  const fullPrompt = buildPrompt(history, prompt);

  debugLog(rid, `starting chat for user=${username} session=${sid} history=${history.length}msgs prompt=${prompt.length}bytes`);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (event, data) => {
    if (!res.writableEnded) {
      res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
    }
  };

  send("session", { sessionId: sid });

  let aborted = false;
  let finished = false;
  let timeout = null;
  let proc = null;

  const killProc = () => {
    if (proc) {
      try { proc.kill("SIGTERM"); } catch {}
    }
  };

  const cleanup = () => {
    aborted = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  const finalize = (event, data) => {
    if (finished) return;
    finished = true;
    cleanup();
    send(event, data);
    if (!res.writableEnded) {
      res.end();
    }
  };

  res.on("close", () => {
    debugLog(rid, "client disconnected");
    cleanup();
    killProc();
  });

  const workspacePath = path.join(DATA_ROOT, username, "workspace");
  const home = path.join(DATA_ROOT, username, "home");
  const runDir = path.join(DATA_ROOT, username, "tmp");

  // Prepare run dir: clean + copy workspace files so Claude can reference them
  // Snapshot existing workspace files before copy so we only bring back *new* outputs later
  let workspaceBefore = new Set();
  try { workspaceBefore = new Set(await fs.readdir(workspacePath)); } catch {}
  await fs.rm(runDir, { recursive: true, force: true });
  await fs.mkdir(runDir, { recursive: true });
  try {
    for (const f of workspaceBefore) {
      await fs.cp(path.join(workspacePath, f), path.join(runDir, f), { recursive: true });
    }
  } catch (e) {
    // workspace may be missing or empty — non-fatal
  }

  if (!fullPrompt || fullPrompt.length === 0) {
    console.error(`[chat] [${rid}] empty fullPrompt, aborting`);
    send("error", { message: "Empty prompt" });
    finalize("done", { exitCode: 1 });
    return;
  }

  let buffer = "";
  let assistantContent = "";
  let assistantThinking = "";
  let inputTokens = null;
  let outputTokens = null;
  let stdoutBytes = 0;
  let stderrOutput = "";

  debugLog(rid, `spawning claude cwd=${runDir} home=${home} promptLen=${fullPrompt.length}`);

  // Pass prompt as argument (not stdin) — stdin pipe may race with Bun binary init on cold start
  // --dangerously-skip-permissions: bypass all permission prompts; headless mode has no TUI for approval dialogs
  proc = spawn(CLAUDE_PATH, [
    "-p",
    "--dangerously-skip-permissions",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    fullPrompt,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: runDir,
    env: { ...process.env, HOME: home },
  });

  proc.stdin.end(); // close stdin immediately, prompt is in args

  timeout = setTimeout(() => {
    console.error(`[chat] [${rid}] timeout reached (${TIMEOUT_MS}ms)`);
    killProc();
    finalize("error", { message: "Request timed out" });
  }, TIMEOUT_MS);

  proc.stdout.on("data", (chunk) => {
    if (aborted || finished) {
      killProc();
      return;
    }

    const str = chunk.toString("utf-8");
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_STDOUT_BYTES) {
      killProc();
      return;
    }
    buffer += str;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);

        if (msg.type === "system" && msg.subtype === "init") {
          debugLog(rid, `claude init: version=${msg.claude_code_version} model=${msg.model} session=${msg.session_id}`);
          continue;
        }

        if (msg.type !== "stream_event" || !msg.event) continue;
        const evt = msg.event;

        if (evt.type === "content_block_delta" && evt.delta) {
          if (evt.delta.type === "text_delta") {
            assistantContent += evt.delta.text;
            if (assistantContent.length > MAX_CONTENT_LENGTH) {
              killProc();
              return;
            }
            send("token", { text: evt.delta.text });
          } else if (evt.delta.type === "thinking_delta") {
            assistantThinking += evt.delta.thinking;
            if (assistantThinking.length > MAX_CONTENT_LENGTH) {
              killProc();
              return;
            }
            send("thinking", { text: evt.delta.thinking });
          }
        }

        if (evt.type === "message_start" && evt.message && evt.message.usage) {
          inputTokens = evt.message.usage.input_tokens;
          send("usage", { input_tokens: inputTokens });
        }

        if (evt.type === "message_delta" && evt.usage) {
          outputTokens = evt.usage.output_tokens;
          send("usage", { output_tokens: outputTokens });
        }
      } catch {
        // skip unparseable lines
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    if (stderrOutput.length > MAX_STDERR_BYTES) return;
    const text = chunk.toString("utf-8");
    stderrOutput += text;
    debugLog(rid, `stderr: ${text.trim().slice(0, 500)}`);
    if (!aborted && !finished) {
      send("stderr", { text });
    }
  });

  proc.on("error", (err) => {
    console.error(`[chat] [${rid}] spawn error: ${err.message} (code=${err.code})`);
    finalize("error", { message: "Failed to start Claude CLI: " + err.message });
  });

  proc.on("close", async (code) => {
    debugLog(rid, `process closed: code=${code} stdout=${stdoutBytes}bytes content=${assistantContent.length}chars stderr=${stderrOutput.length}bytes`);

    if (!finished) {
      try {
        const msgs = [
          { role: "user", content: prompt },
        ];
        if (assistantContent) {
          msgs.push({
            role: "assistant",
            content: assistantContent,
            thinking: assistantThinking || undefined,
            inputTokens,
            outputTokens,
          });
        }
        await appendMessages(username, sid, msgs);
      } catch (err) {
        console.error(`[chat] [${rid}] Failed to persist session:`, err.message);
      }
    }

    // Move output files from runDir back to workspace
    const OUTPUT_EXTS = new Set([
      ".pdf", ".pptx", ".ppt", ".docx", ".doc", ".xlsx", ".xls",
      ".csv", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp",
      ".html", ".htm", ".txt", ".json", ".xml", ".yaml", ".yml",
      ".zip", ".tar", ".gz", ".mp4", ".mp3", ".wav",
    ]);
    try {
      const newFiles = await fs.readdir(runDir);
      for (const f of newFiles) {
        // Only bring back files Claude actually created, not workspace files copied in at start
        if (OUTPUT_EXTS.has(path.extname(f).toLowerCase()) && !workspaceBefore.has(f)) {
          await fs.cp(path.join(runDir, f), path.join(workspacePath, f), { recursive: true, force: true });
        }
      }
    } catch (e) {
      console.error(`[chat] [${rid}] Failed to move outputs:`, e.message);
    }

    finalize("done", { exitCode: code });
  });
});

module.exports = router;
