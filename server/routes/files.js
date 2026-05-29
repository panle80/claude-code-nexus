const { Router } = require("express");
const fs = require("fs/promises");
const fss = require("fs");
const path = require("path");
const multer = require("multer");
const { workspaceDir, safeResolve } = require("../utils");

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// GET /api/files — list workspace files
router.get("/", async (req, res) => {
  try {
    const dir = workspaceDir(req.user.username);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(dir, entry.name);
      const stat = await fs.stat(filePath);
      files.push({
        name: entry.name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ext: path.extname(entry.name).toLowerCase(),
      });
    }

    files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: "读取文件列表失败：" + err.message });
  }
});

// GET /api/files/download — download a workspace file
router.get("/download", async (req, res) => {
  const fileName = req.query.path || "";
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    return res.status(400).json({ error: "文件名无效" });
  }

  const baseDir = workspaceDir(req.user.username);
  const resolved = safeResolve(baseDir, fileName);
  if (!resolved) return res.status(400).json({ error: "文件路径无效" });

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return res.status(404).json({ error: "文件不存在" });
  } catch {
    return res.status(404).json({ error: "文件不存在" });
  }

  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";
  res.setHeader("Content-Type", contentType);

  // Inline for browser-viewable types, attachment for others
  const inlineTypes = [".html", ".htm", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".pdf", ".txt", ".md", ".json", ".mp3", ".mp4", ".webm"];
  const disposition = inlineTypes.includes(ext) ? "inline" : "attachment";
  res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(fileName)}"`);

  fss.createReadStream(resolved).pipe(res);
});

// DELETE /api/files — delete a workspace file
router.delete("/", async (req, res) => {
  const fileName = req.query.path || "";
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    return res.status(400).json({ error: "文件名无效" });
  }

  const baseDir = workspaceDir(req.user.username);
  const resolved = safeResolve(baseDir, fileName);
  if (!resolved) return res.status(400).json({ error: "文件路径无效" });

  try {
    await fs.rm(resolved);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "删除文件失败：" + err.message });
  }
});

// POST /api/files/upload — upload a file to workspace
router.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "未选择文件" });

  let name = file.originalname || "untitled";
  // Strip path separators to prevent traversal
  name = path.basename(name);

  const dir = workspaceDir(req.user.username);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  // Handle duplicate names: report.pdf → report_1.pdf
  let destPath = path.join(dir, name);
  if (fss.existsSync(destPath)) {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    let n = 1;
    do {
      name = `${base}_${n}${ext}`;
      destPath = path.join(dir, name);
      n++;
    } while (fss.existsSync(destPath));
  }

  try {
    await fs.writeFile(destPath, file.buffer);
    const stat = await fs.stat(destPath);
    res.json({
      ok: true,
      file: {
        name,
        size: stat.size,
        ext: path.extname(name).toLowerCase(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "文件保存失败：" + err.message });
  }
});

module.exports = router;
