const express = require("express");
const { join } = require("path");
const { mkdirSync, writeFileSync, rmSync } = require("fs");
const { tmpdir } = require("os");

// Set required env before loading app modules
process.env.JWT_SECRET = "test-secret-for-unit-tests-only";
process.env.USER_DATA_ROOT = join(tmpdir(), "ccn-test-users");

const DATA_ROOT = process.env.USER_DATA_ROOT;

function buildApp() {
  const app = express();
  app.use(express.json());

  const { requireAuth } = require("../middleware/auth");
  const authRouter = require("../routes/auth");

  app.use("/api/auth", authRouter);
  app.use("/api", requireAuth, (req, res) => {
    res.json({ ok: true, user: req.user.username });
  });

  return app;
}

function req(app, method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({
    status: res.status,
    body: await res.json(),
  }));
}

// Start a real Express server on a random port for testing
let server;
let baseUrl;

beforeAll(async () => {
  // Clean and recreate test user dir
  try { rmSync(DATA_ROOT, { recursive: true, force: true }); } catch {}
  mkdirSync(DATA_ROOT, { recursive: true });

  const app = buildApp();

  // Find an available port
  const { createServer } = require("net");
  const port = await new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });

  baseUrl = `http://127.0.0.1:${port}`;

  await new Promise((resolve) => {
    server = app.listen(port, resolve);
  });
});

// Override req to use real HTTP
function httpReq(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({
    status: res.status,
    body: await res.json(),
  }));
}

describe("Auth API", () => {
  describe("POST /api/auth/register", () => {
    it("rejects short usernames", async () => {
      const res = await httpReq("POST", "/api/auth/register", { username: "a", password: "test1234" });
      expect(res.status).toBe(400);
    });

    it("rejects short passwords", async () => {
      const res = await httpReq("POST", "/api/auth/register", { username: "testuser1", password: "ab" });
      expect(res.status).toBe(400);
    });

    it("registers a new user and returns token", async () => {
      const res = await httpReq("POST", "/api/auth/register", { username: "testuser1", password: "test1234" });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.username).toBe("testuser1");
    });

    it("rejects duplicate username", async () => {
      const res = await httpReq("POST", "/api/auth/register", { username: "testuser1", password: "test1234" });
      expect(res.status).toBe(409);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeAll(async () => {
      // Ensure testuser2 exists
      await httpReq("POST", "/api/auth/register", { username: "testuser2", password: "correct1234" });
    });

    it("rejects wrong password", async () => {
      const res = await httpReq("POST", "/api/auth/login", { username: "testuser2", password: "wrongpass" });
      expect(res.status).toBe(401);
    });

    it("rejects non-existent user with same error as wrong password", async () => {
      const res = await httpReq("POST", "/api/auth/login", { username: "noone12345", password: "whatever" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("用户名或密码错误");
    });

    it("logs in with correct password", async () => {
      const res = await httpReq("POST", "/api/auth/login", { username: "testuser2", password: "correct1234" });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
    });
  });

  describe("GET /api/auth/me", () => {
    it("rejects without token", async () => {
      const res = await httpReq("GET", "/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("returns user with valid token", async () => {
      const login = await httpReq("POST", "/api/auth/login", { username: "testuser2", password: "correct1234" });
      const res = await httpReq("GET", "/api/auth/me", undefined, login.body.token);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe("testuser2");
    });

    it("rejects invalid token", async () => {
      const res = await httpReq("GET", "/api/auth/me", undefined, "invalid-token-here");
      expect(res.status).toBe(401);
    });
  });
});
