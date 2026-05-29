const express = require("express");
const { join } = require("path");
const { mkdirSync, rmSync } = require("fs");
const { tmpdir } = require("os");
const { createServer } = require("net");

process.env.JWT_SECRET = "test-secret-sessions";
process.env.USER_DATA_ROOT = join(tmpdir(), "ccn-test-sessions");

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
    body: await res.json().catch(() => ({})),
  }));
}

beforeAll(async () => {
  try { rmSync(DATA_ROOT, { recursive: true, force: true }); } catch {}
  mkdirSync(DATA_ROOT, { recursive: true });

  const app = express();
  app.use(express.json());

  const authRouter = require("../routes/auth");
  const sessionsRouter = require("../routes/sessions");
  const { requireAuth } = require("../middleware/auth");

  app.use("/api/auth", authRouter);
  app.use("/api/sessions", requireAuth, sessionsRouter);

  const port = await new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });

  baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve) => { server = app.listen(port, resolve); });

  // Register and login
  await api("POST", "/api/auth/register", { username: "testuser", password: "test1234" });
  const login = await api("POST", "/api/auth/login", { username: "testuser", password: "test1234" });
  token = login.body.token;
});

afterAll(() => { server?.close(); });

describe("Sessions API", () => {
  describe("GET /api/sessions", () => {
    it("returns empty list for new user", async () => {
      const res = await api("GET", "/api/sessions");
      expect(res.status).toBe(200);
      expect(res.body.sessions).toEqual([]);
    });

    it("returns sessions after creation", async () => {
      await api("POST", "/api/sessions");
      await api("POST", "/api/sessions");
      const res = await api("GET", "/api/sessions");
      expect(res.status).toBe(200);
      expect(res.body.sessions.length).toBe(2);
    });
  });

  describe("POST /api/sessions", () => {
    it("creates a session and returns sessionId", async () => {
      const res = await api("POST", "/api/sessions");
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBeTruthy();
      expect(typeof res.body.sessionId).toBe("string");
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("returns empty messages for new session", async () => {
      const { body: { sessionId } } = await api("POST", "/api/sessions");
      const res = await api("GET", `/api/sessions/${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
    });

    it("returns 400 for invalid sessionId format", async () => {
      const res = await api("GET", "/api/sessions/bad!!!id###");
      expect(res.status).toBe(400);
    });

    it("returns empty for non-existent session", async () => {
      const res = await api("GET", "/api/sessions/mpdeadbeef1234");
      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
    });
  });

  describe("POST /api/sessions/:id/messages", () => {
    let sid;
    beforeEach(async () => {
      const { body } = await api("POST", "/api/sessions");
      sid = body.sessionId;
    });

    it("appends messages and returns them in GET", async () => {
      const msgs = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ];
      const res = await api("POST", `/api/sessions/${sid}/messages`, { messages: msgs });
      expect(res.status).toBe(200);

      const get = await api("GET", `/api/sessions/${sid}`);
      expect(get.body.messages.length).toBe(2);
      expect(get.body.messages[0].role).toBe("user");
    });

    it("rejects empty messages array", async () => {
      const res = await api("POST", `/api/sessions/${sid}/messages`, { messages: [] });
      expect(res.status).toBe(400);
    });

    it("rejects invalid message role", async () => {
      const res = await api("POST", `/api/sessions/${sid}/messages`, {
        messages: [{ role: "system", content: "bad" }],
      });
      expect(res.status).toBe(400);
    });

    it("rejects empty content", async () => {
      const res = await api("POST", `/api/sessions/${sid}/messages`, {
        messages: [{ role: "user", content: "" }],
      });
      expect(res.status).toBe(400);
    });

    it("rejects non-object message", async () => {
      const res = await api("POST", `/api/sessions/${sid}/messages`, {
        messages: ["not an object"],
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/sessions/:id/title", () => {
    let sid;
    beforeEach(async () => {
      const { body } = await api("POST", "/api/sessions");
      sid = body.sessionId;
    });

    it("sets a title", async () => {
      const res = await api("PUT", `/api/sessions/${sid}/title`, { title: "My Session" });
      expect(res.status).toBe(200);
    });

    it("rejects title over 200 chars", async () => {
      const res = await api("PUT", `/api/sessions/${sid}/title`, { title: "x".repeat(201) });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/sessions/:id", () => {
    it("deletes a session", async () => {
      const { body: { sessionId } } = await api("POST", "/api/sessions");
      const res = await api("DELETE", `/api/sessions/${sessionId}`);
      expect(res.status).toBe(200);
    });

    it("returns ok for non-existent session (idempotent)", async () => {
      const res = await api("DELETE", "/api/sessions/mpdeadbeef9999");
      expect(res.status).toBe(200);
    });
  });
});
