import { useSessions } from "./useSessions";
import { useMessages } from "./useMessages";
import { useCallback, useEffect, useRef } from "react";

export { SESSION_KEY } from "./useSessions";

export function useChat(token) {
  const {
    sessionId,
    sessions,
    hydrated,
    initialMessages,
    loadSession,
    createSession,
    deleteSession,
    renameSession,
    fetchSessions,
  } = useSessions(token);

  const {
    messages,
    setMessages,
    isStreaming,
    sendMessage,
    abort,
    retry,
  } = useMessages(token, sessionId, createSession, fetchSessions);

  const lastHydrationToken = useRef(null);
  useEffect(() => {
    if (initialMessages !== null && lastHydrationToken.current !== token) {
      setMessages(initialMessages);
      lastHydrationToken.current = token;
    }
  }, [initialMessages, token, setMessages]);

  const wrappedLoadSession = useCallback(async (sid) => {
    const msgs = await loadSession(sid);
    setMessages(msgs);
  }, [loadSession, setMessages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    createSession();
  }, [createSession, setMessages]);

  return {
    messages,
    isStreaming,
    sendMessage,
    retry,
    abort,
    clearMessages,
    sessionId,
    sessions,
    loadSession: wrappedLoadSession,
    createSession,
    deleteSession,
    renameSession,
    hydrated,
  };
}
