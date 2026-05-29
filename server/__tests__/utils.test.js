const { safeResolve, genId, sessionsDir, sessionFile, parseJsonlAsync } = require("../utils");

describe("safeResolve", () => {
  const { resolve } = require("path");
  const { tmpdir } = require("os");
  const base = resolve(tmpdir(), "ccn-safe-resolve-test");

  it("allows paths within the base directory", () => {
    const result = safeResolve(base, "subdir/file.txt");
    expect(result).toBeTruthy();
    expect(result).toContain("subdir");
  });

  it("allows the base directory itself", () => {
    const result = safeResolve(base, ".");
    expect(result).toBeTruthy();
  });

  it("blocks path traversal with ../", () => {
    const result = safeResolve(base, "../../../etc/passwd");
    expect(result).toBeNull();
  });

  it("blocks path traversal with backslashes", () => {
    const result = safeResolve(base, "..\\..\\..\\etc\\passwd");
    expect(result).toBeNull();
  });

  it("blocks absolute path override", () => {
    const result = safeResolve(base, "/etc/passwd");
    expect(result).toBeNull();
  });

  it("blocks traversal with mixed backslashes and forward slashes", () => {
    const result = safeResolve(base, "sub\\..\\..\\..\\etc/passwd");
    expect(result).toBeNull();
  });

  it("allows normal nested paths", () => {
    const result = safeResolve(base, "projects/myapp/src/index.js");
    expect(result).toBeTruthy();
    expect(result.replace(/\\/g, "/")).toContain("projects/myapp/src/index.js");
  });

  it("handles empty relative path", () => {
    const result = safeResolve(base, "");
    expect(result).toBeTruthy();
  });
});

describe("genId", () => {
  it("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(genId());
    }
    expect(ids.size).toBe(100);
  });

  it("generates strings with expected format", () => {
    const id = genId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(8);
  });
});

describe("sessionsDir", () => {
  it("returns path containing username", () => {
    const dir = sessionsDir("alice");
    expect(dir).toContain("alice");
    expect(dir).toContain("sessions");
  });
});

describe("sessionFile", () => {
  it("returns .jsonl file path", () => {
    const fp = sessionFile("alice", "abc123");
    expect(fp).toContain("abc123.jsonl");
    expect(fp).toContain("sessions");
  });
});

describe("parseJsonlAsync", () => {
  const { writeFile, unlink } = require("fs/promises");
  const { join } = require("path");
  const { tmpdir } = require("os");

  it("returns empty array for non-existent file", async () => {
    const result = await parseJsonlAsync("/nonexistent/path/file.jsonl");
    expect(result).toEqual([]);
  });

  it("parses valid JSONL", async () => {
    const file = join(tmpdir(), "test-parse-async.jsonl");
    await writeFile(file, '{"role":"user","content":"hello"}\n{"role":"assistant","content":"hi"}\n');
    try {
      const result = await parseJsonlAsync(file);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
    } finally {
      await unlink(file);
    }
  });

  it("skips invalid JSON lines", async () => {
    const file = join(tmpdir(), "test-bad-async.jsonl");
    await writeFile(file, '{"role":"user"}\nnot json\n{"role":"assistant"}\n');
    try {
      const result = await parseJsonlAsync(file);
      expect(result).toHaveLength(2);
    } finally {
      await unlink(file);
    }
  });

  it("handles empty file", async () => {
    const file = join(tmpdir(), "test-empty-async.jsonl");
    await writeFile(file, "");
    try {
      const result = await parseJsonlAsync(file);
      expect(result).toEqual([]);
    } finally {
      await unlink(file);
    }
  });
});
