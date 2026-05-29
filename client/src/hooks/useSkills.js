import { useState, useCallback } from "react";

async function apiFetch(url, options = {}, token) {
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

export function useSkills(token) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchSkills = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/skills", {}, token);
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch (err) {
      console.error("[fetchSkills]", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const uploadSkill = useCallback(async (file) => {
    if (!token) return null;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/skills/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      await fetchSkills();
      return data;
    } catch (err) {
      console.error("[uploadSkill]", err);
      throw err;
    }
  }, [token, fetchSkills]);

  const deleteSkill = useCallback(async (name) => {
    if (!token) return;
    try {
      const res = await apiFetch(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" }, token);
      if (res.ok) await fetchSkills();
      return res.ok;
    } catch (err) {
      console.error("[deleteSkill]", err);
      return false;
    }
  }, [token, fetchSkills]);

  const installSkill = useCallback(async (name) => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "安装失败");
      await fetchSkills();
      return data;
    } catch (err) {
      console.error("[installSkill]", err);
      throw err;
    }
  }, [token, fetchSkills]);

  return { skills, loading, fetchSkills, uploadSkill, deleteSkill, installSkill };
}
