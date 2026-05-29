import { useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage";

function SkeletonMessage({ isUser }) {
  return (
    <div className={`flex gap-3 md:gap-4 px-3 md:px-5 py-3 md:py-5 ${isUser ? "bg-claude-canvas border-b border-claude-border/50" : "bg-claude-surface"}`}>
      <div className="shrink-0 pt-0.5">
        <div className="w-7 h-7 rounded-full bg-claude-surface-hover animate-pulse" />
      </div>
      <div className="flex-1 md:max-w-[832px] space-y-2.5 pt-1">
        <div className="h-3 w-12 bg-claude-surface-hover rounded animate-pulse" />
        <div className="h-3.5 bg-claude-surface-hover rounded animate-pulse w-3/4" />
        <div className="h-3.5 bg-claude-surface-hover rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

export default function ChatArea({ messages, theme, isStreaming, loading, onRetry }) {
  const bottomRef = useRef(null);
  const lastLenRef = useRef(0);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    if (isStreaming) {
      el.scrollIntoView({ behavior: "auto" });
      return;
    }

    const newLen = messages.length;
    if (newLen !== lastLenRef.current) {
      el.scrollIntoView({ behavior: "smooth" });
    }
    lastLenRef.current = newLen;
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="消息区域">
      {loading ? (
        <div className="max-w-full md:max-w-[900px] mx-auto">
          <SkeletonMessage isUser />
          <SkeletonMessage isUser={false} />
          <SkeletonMessage isUser />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-5 px-4">
          <p className="text-[15px] text-claude-muted text-center leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
            开始与 Claude 对话
          </p>
        </div>
      ) : (
        <div className="max-w-full md:max-w-[900px] mx-auto">
          {messages.map((msg, i) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              theme={theme}
              isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
              onRetry={i === messages.length - 1 && msg.role === "assistant" ? onRetry : undefined}
            />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
