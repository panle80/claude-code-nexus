import { useState, useCallback, useRef } from "react";

export function useMessages(token, sessionId, createSession, fetchSessions) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);
  const lastPromptRef = useRef("");

  const sendMessage = useCallback(async (prompt) => {
    if (!prompt.trim() || isStreaming) return;

    lastPromptRef.current = prompt;

    const userMsg = { id: Date.now(), role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = Date.now() + 1;
    const assistantMsg = {
      id: assistantId,
      role: "assistant",
      content: "",
      startTime: Date.now(),
      inputTokens: null,
      outputTokens: null,
      duration: null,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    let sid = sessionId;
    if (!sid) {
      sid = await createSession();
    }
    if (!sid) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "**Error:** Failed to create session", isError: true } : m
        )
      );
      return;
    }

    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, sessionId: sid }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `**Error:** ${err.error || "Request failed"}`, isError: true } : m
          )
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "token";
      let receivedSessionId = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (.+)$/);
          if (eventMatch) {
            currentEvent = eventMatch[1];
            continue;
          }

          const dataMatch = line.match(/^data: (.+)$/);
          if (dataMatch) {
            try {
              const parsed = JSON.parse(dataMatch[1]);

              if (currentEvent === "token") {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + parsed.text } : m))
                );
              } else if (currentEvent === "thinking") {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, thinking: (m.thinking || "") + parsed.text } : m))
                );
              } else if (currentEvent === "session") {
                receivedSessionId = parsed.sessionId;
              } else if (currentEvent === "usage") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, inputTokens: parsed.input_tokens ?? m.inputTokens, outputTokens: parsed.output_tokens ?? m.outputTokens }
                      : m
                  )
                );
              } else if (currentEvent === "error") {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + `\n\n**Error:** ${parsed.message}`, isError: true } : m))
                );
              } else if (currentEvent === "stderr") {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + `\n\n**Stderr:** ${parsed.text}` } : m))
                );
              } else if (currentEvent === "done") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    let content = m.content;
                    if (parsed.exitCode !== 0) {
                      content += `\n\n**进程退出码:** ${parsed.exitCode}`;
                    }
                    if (!content && parsed.exitCode === 0) {
                      content = "**Error:** Claude 未生成任何输出，请检查服务器日志";
                      isError = true;
                    }
                    return { ...m, content };
                  })
                );
              }
            } catch {
              // skip unparseable data
            }
          }
        }
      }

      if (receivedSessionId || sid) {
        fetchSessions();
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + `\n\n**Error:** ${err.message}`, isError: true } : m))
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, duration: Date.now() - (m.startTime || Date.now()) } : m
        )
      );
    }
  }, [token, sessionId, isStreaming, createSession, fetchSessions]);

  const retry = useCallback(() => {
    if (lastPromptRef.current) {
      sendMessage(lastPromptRef.current);
    }
  }, [sendMessage]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, setMessages, isStreaming, sendMessage, abort, retry };
}
