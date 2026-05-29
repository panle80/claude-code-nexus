import { useState, useCallback, useEffect } from "react";

export const SESSION_KEY = "claude-web-ide-session";

async function apiFetch(url, options = {}, token) {
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

export function useSessions(token) {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY) || null);
  const [sessions, setSessions] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [initialMessages, setInitialMessages] = useState(null);

  const fetchSessions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/sessions", {}, token);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("[fetchSessions]", err);
    }
  }, [token]);

  const loadSession = useCallback(async (sid) => {
    if (!sid) return;
    try {
      const res = await apiFetch(`/api/sessions/${sid}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (err) {
      console.error("[loadSession]", err);
    }
    return [];
  }, [token]);

  const switchToSession = useCallback(async (sid) => {
    const msgs = await loadSession(sid);
    if (msgs.length > 0 || sid) {
      setSessionId(sid);
      localStorage.setItem(SESSION_KEY, sid);
    }
    return msgs;
  }, [loadSession]);

  const createSession = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sessions", { method: "POST" }, token);
      if (res.ok) {
        const { sessionId: sid } = await res.json();
        setSessionId(sid);
        localStorage.setItem(SESSION_KEY, sid);
        fetchSessions();
        return sid;
      }
    } catch (err) {
      console.error("[createSession]", err);
    }
    return null;
  }, [token, fetchSessions]);

  const renameSession = useCallback(async (sid, title) => {
    try {
      const res = await apiFetch(`/api/sessions/${sid}/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }, token);
      if (res.ok) fetchSessions();
    } catch (err) {
      console.error("[renameSession]", err);
    }
  }, [token, fetchSessions]);

  const deleteSession = useCallback(async (sid) => {
    try {
      const res = await apiFetch(`/api/sessions/${sid}`, { method: "DELETE" }, token);
      if (res.ok) {
        if (sid === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sid);
          if (remaining.length > 0) {
            await switchToSession(remaining[0].id);
          } else {
            await createSession();
          }
        }
        fetchSessions();
      }
    } catch (err) {
      console.error("[deleteSession]", err);
    }
  }, [token, sessionId, sessions, switchToSession, createSession, fetchSessions]);

  useEffect(() => {
    if (!token) return;
    fetchSessions().then(async () => {
      if (sessionId) {
        const msgs = await loadSession(sessionId);
        setInitialMessages(msgs);
        setHydrated(true);
      } else {
        await createSession();
        setInitialMessages([]);
        setHydrated(true);
      }
    });
  }, [token]); // only rehydrate when auth changes

  return {
    sessionId,
    sessions,
    hydrated,
    initialMessages,
    loadSession: switchToSession,
    createSession,
    deleteSession,
    renameSession,
    fetchSessions,
  };
}
