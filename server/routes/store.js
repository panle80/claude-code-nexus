const { Router } = require("express");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const matter = require("gray-matter");
const { storeDir } = require("../utils");

const router = Router();

async function readSkill(dirPath) {
  const mdPath = path.join(dirPath, "SKILL.md");
  try {
    const raw = await fs.readFile(mdPath, "utf-8");
    const parsed = matter(raw);
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
  } catch {
    return null;
  }
}

// Sync new skills from ~/.claude/skills/ into the marketplace store
async function syncFromSystemSkills(store) {
  const systemDir = path.join(os.homedir(), ".claude", "skills");
  let entries;
  try {
    entries = await fs.readdir(systemDir, { withFileTypes: true });
  } catch {
    return; // no system skills directory, nothing to sync
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const destDir = path.join(store, entry.name);
    try {
      await fs.access(destDir);
    } catch {
      // Not yet in marketplace — copy it over
      const srcDir = path.join(systemDir, entry.name);
      await fs.cp(srcDir, destDir, { recursive: true });
    }
  }
}

// GET /api/store — list all skills in marketplace
router.get("/", async (req, res) => {
  try {
    const dir = storeDir();
    await fs.mkdir(dir, { recursive: true, mode: 0o755 });

    // Sync new skills from CLI-installed ~/.claude/skills/ before listing
    await syncFromSystemSkills(dir);

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
    res.status(500).json({ error: "获取技能市场列表失败：" + err.message });
  }
});

module.exports = router;
