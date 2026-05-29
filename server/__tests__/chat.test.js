const express = require("express");
const { join } = require("path");
const { mkdirSync, rmSync } = require("fs");
const { tmpdir } = require("os");
const { createServer } = require("net");
const { EventEmitter } = require("events");

process.env.JWT_SECRET = "test-secret-chat";
process.env.USER_DATA_ROOT = join(tmpdir(), "ccn-test-chat");
process.env.CLAUDE_TIMEOUT = "3000";

const DATA_ROOT = process.env.USER_DATA_ROOT;

let server, baseUrl, token;

function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({
    status: res.status,
    body: res.headers.get("content-type")?.includes("text/event-stream") ? res : await res.json().catch(() => ({})),
  }));
}

// Mock child_process.spawn
const mockProc = new EventEmitter();
mockProc.stdin = new EventEmitter();
mockProc.stdin.end = () => {};
mockProc.stdout = new EventEmitter();
mockProc.stderr = new EventEmitter();

vi.mock("child_process", () => ({
  spawn: vi.fn(() => mockProc),
}));

beforeAll(async () => {
  try { rmSync(DATA_ROOT, { recursive: true, force: true }); } catch {}
  mkdirSync(DATA_ROOT, { recursive: true });

  const app = express();
  app.use(express.json());

  const authRouter = require("../routes/auth");
  const chatRouter = require("../routes/chat");
  const { requireAuth } = require("../middleware/auth");

  app.use("/api/auth", authRouter);
  app.use("/api/chat", requireAuth, chatRouter);

  const port = await new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });

  baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve) => { server = app.listen(port, resolve); });

  await api("POST", "/api/auth/register", { username: "chatuser", password: "test1234" });
  const login = await api("POST", "/api/auth/login", { username: "chatuser", password: "test1234" });
  token = login.body.token;
});

afterAll(() => { server?.close(); });

describe("Chat API", () => {
  describe("POST /api/chat — validation", () => {
    it("returns 400 for missing prompt", async () => {
      const res = await api("POST", "/api/chat", {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("prompt is required");
    });

    it("returns 400 for empty prompt", async () => {
      const res = await api("POST", "/api/chat", { prompt: "   " });
      expect(res.status).toBe(400);
    });

    it("returns 400 for oversized prompt", async () => {
      const res = await api("POST", "/api/chat", { prompt: "x".repeat(100001) });
      expect(res.status).toBe(400);
    });

    it("returns SSE content-type for valid prompt", async () => {
      // Simulate a quick process exit
      setTimeout(() => { mockProc.emit("close", 0); }, 10);

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: "hello" }),
      });

      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });
  });
});
