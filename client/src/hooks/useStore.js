import { useState, useCallback } from "react";

async function apiFetch(url, options = {}, token) {
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

export function useStore(token) {
  const [storeSkills, setStoreSkills] = useState([]);
  const [storeLoading, setStoreLoading] = useState(false);

  const fetchStore = useCallback(async () => {
    if (!token) return;
    setStoreLoading(true);
    try {
      const res = await apiFetch("/api/store", {}, token);
      if (res.ok) {
        const data = await res.json();
        setStoreSkills(data.skills || []);
      }
    } catch (err) {
      console.error("[fetchStore]", err);
    } finally {
      setStoreLoading(false);
    }
  }, [token]);

  const uploadToStore = useCallback(async (file) => {
    if (!token) return null;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/store/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      await fetchStore();
      return data;
    } catch (err) {
      console.error("[uploadToStore]", err);
      throw err;
    }
  }, [token, fetchStore]);

  const deleteFromStore = useCallback(async (name) => {
    if (!token) return;
    try {
      const res = await apiFetch(`/api/store/${encodeURIComponent(name)}`, { method: "DELETE" }, token);
      if (res.ok) await fetchStore();
      return res.ok;
    } catch (err) {
      console.error("[deleteFromStore]", err);
      return false;
    }
  }, [token, fetchStore]);

  return { storeSkills, storeLoading, fetchStore, uploadToStore, deleteFromStore };
}
