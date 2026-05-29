const { Router } = require("express");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");
const AdmZip = require("adm-zip");
const matter = require("gray-matter");
const { skillsDir, storeDir, validateSkillName, resolveSkillPath } = require("../utils");

const router = Router();

function requireValidSkill(req, res, next) {
  const name = req.params.name || "";
  if (!name || !validateSkillName(name)) {
    return res.status(400).json({ error: "技能名称格式不正确" });
  }
  const resolved = resolveSkillPath(req.user.username, name);
  if (!resolved) {
    return res.status(400).json({ error: "技能名称无效" });
  }
  req.skillName = name;
  req.skillDirResolved = resolved;
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("只支持 ZIP 文件上传"));
    }
  },
});

// Read SKILL.md from a directory, fall back to skill.json for legacy
async function readSkill(dirPath) {
  const mdPath = path.join(dirPath, "SKILL.md");
  try {
    const raw = await fs.readFile(mdPath, "utf-8");
    const parsed = matter(raw);
    // Fallback: extract first non-empty, non-heading line from body as description
    let desc = parsed.data.description || "";
    if (!desc && parsed.content) {
      desc = parsed.content
        .split("\n")
        .map(l => l.trim())
        .find(l => l && !l.startsWith("#") && !l.startsWith("```") && l.length > 5) || "";
      if (desc.length > 80) desc = desc.slice(0, 80) + "...";
    }

    return {
      name: parsed.data.name || path.basename(dirPath),
      description: desc,
      icon: parsed.data.icon || "",
      body: parsed.content.trim(),
      model: parsed.data.model || null,
      context: parsed.data.context || null,
      disableModelInvocation: parsed.data["disable-model-invocation"] || false,
      allowedTools: parsed.data["allowed-tools"] || null,
      installedAt: (await fs.stat(mdPath)).mtime.toISOString(),
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      // Fall back to legacy skill.json
      const jsonPath = path.join(dirPath, "skill.json");
      try {
        const raw = await fs.readFile(jsonPath, "utf-8");
        const skill = JSON.parse(raw);
        const stat = await fs.stat(jsonPath);
        return { ...skill, body: skill.prompt || "", installedAt: stat.mtime.toISOString() };
      } catch {
        return null;
      }
    }
    return null;
  }
}

// GET /api/skills — list all installed skills
router.get("/", async (req, res) => {
  try {
    const dir = skillsDir(req.user.username);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return res.json({ skills: [] });
      throw err;
    }

    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await readSkill(path.join(dir, entry.name));
      if (skill) skills.push(skill);
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: "获取技能列表失败：" + err.message });
  }
});

// GET /api/skills/:name — get single skill
router.get("/:name", requireValidSkill, async (req, res) => {
  try {
    const skill = await readSkill(req.skillDirResolved);
    if (!skill) return res.status(404).json({ error: "技能不存在" });
    res.json(skill);
  } catch (err) {
    res.status(500).json({ error: "获取技能详情失败：" + err.message });
  }
});

// POST /api/skills/upload — upload ZIP skill package
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "请选择要上传的 ZIP 文件" });
  }

  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();

    // Find SKILL.md (preferred) or skill.json (legacy) in the zip
    let mdEntry = null;
    let jsonEntry = null;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = path.basename(entry.entryName);
      if (name === "SKILL.md") {
        const depth = entry.entryName.split("/").length;
        if (!mdEntry || depth < mdEntry.entryName.split("/").length) {
          mdEntry = entry;
        }
      } else if (name === "skill.json") {
        const depth = entry.entryName.split("/").length;
        if (!jsonEntry || depth < jsonEntry.entryName.split("/").length) {
          jsonEntry = entry;
        }
      }
    }

    const entry = mdEntry || jsonEntry;
    if (!entry) {
      return res.status(400).json({ error: "ZIP 中未找到 SKILL.md 或 skill.json 文件" });
    }

    // Parse to get the skill name
    let skillName;
    let skillData = {};

    if (mdEntry) {
      const raw = mdEntry.getData().toString("utf-8");
      const parsed = matter(raw);
      skillName = parsed.data.name || "";
      skillData = { ...parsed.data, body: parsed.content.trim() };
    } else {
      try {
        const data = JSON.parse(jsonEntry.getData().toString("utf-8"));
        skillName = data.name || "";
        skillData = { ...data, body: data.prompt || "" };
      } catch {
        return res.status(400).json({ error: "skill.json 格式不正确" });
      }
    }

    if (!skillName || typeof skillName !== "string") {
      return res.status(400).json({ error: "SKILL.md 或 skill.json 缺少有效的 name 字段" });
    }
    if (!validateSkillName(skillName)) {
      return res.status(400).json({ error: "技能名称格式不正确（仅支持字母、数字和连字符）" });
    }

    // Determine the source prefix
    const prefix = entry.entryName.replace(/\/?(SKILL\.md|skill\.json)$/, "");
    const destDir = path.join(skillsDir(req.user.username), skillName);

    // Remove existing install
    await fs.rm(destDir, { recursive: true, force: true });
    await fs.mkdir(destDir, { recursive: true, mode: 0o700 });

    // Extract all files under the same prefix
    for (const e of entries) {
      if (e.isDirectory) continue;
      if (prefix && !e.entryName.startsWith(prefix + "/") && e.entryName !== prefix) continue;
      const rel = prefix ? e.entryName.slice(prefix.length + 1) : e.entryName;
      const destPath = path.join(destDir, rel);
      await fs.mkdir(path.dirname(destPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(destPath, e.getData());
    }

    res.json({ ok: true, skill: { name: skillName, ...skillData } });
  } catch (err) {
    if (err.message && err.message.startsWith("只支持")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "上传技能失败：" + err.message });
  }
});

// DELETE /api/skills/:name — delete a skill
router.delete("/:name", requireValidSkill, async (req, res) => {
  try {
    await fs.rm(req.skillDirResolved, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "删除技能失败：" + err.message });
  }
});

// POST /api/skills/install — install a skill from the marketplace
router.post("/install", async (req, res) => {
  const { name } = req.body || {};
  if (!name || !validateSkillName(name)) {
    return res.status(400).json({ error: "技能名称格式不正确" });
  }

  const srcDir = path.join(storeDir(), name);
  const destDir = path.join(skillsDir(req.user.username), name);

  try {
    const stat = await fs.stat(srcDir);
    if (!stat.isDirectory()) {
      return res.status(404).json({ error: "市场中未找到该技能" });
    }
  } catch {
    return res.status(404).json({ error: "市场中未找到该技能" });
  }

  try {
    await fs.rm(destDir, { recursive: true, force: true });
    await fs.cp(srcDir, destDir, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "安装技能失败：" + err.message });
  }
});

module.exports = router;
