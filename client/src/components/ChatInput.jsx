import { useState, useRef, useEffect } from "react";
import FileAttachment from "./FileAttachment";

export default function ChatInput({ onSend, onAbort, isStreaming, prefill, onPrefillConsumed, attachments, onAddFile, onRemoveAttachment }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const prefillRef = useRef(prefill);
  const consumedRef = useRef(onPrefillConsumed);
  consumedRef.current = onPrefillConsumed;

  useEffect(() => {
    if (!isStreaming) {
      textareaRef.current?.focus();
    }
  }, [isStreaming]);

  useEffect(() => {
    if (prefill && prefill !== prefillRef.current) {
      prefillRef.current = prefill;
      setInput(prefill);
      textareaRef.current?.focus();
      requestAnimationFrame(() => adjustHeight());
      consumedRef.current?.();
    }
  }, [prefill]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (!files) return;
    for (const f of files) {
      onAddFile(f);
    }
    e.target.value = "";
  };

  const hasAttachments = attachments && attachments.length > 0;

  return (
    <div className="border-t border-claude-border bg-claude-surface px-2 md:px-4 py-2.5 md:py-3.5">
      <form
        onSubmit={handleSubmit}
        className="max-w-full md:max-w-[864px] mx-auto"
      >
        {hasAttachments && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {attachments.map((f) => (
              <FileAttachment key={f.name} file={f} onRemove={onRemoveAttachment} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-11 md:h-11 -mt-1 md:mt-0 rounded-xl bg-claude-surface-raised hover:bg-claude-surface-hover border border-claude-border text-claude-muted hover:text-claude-body transition-colors duration-200 flex items-center justify-center"
            aria-label="上传文件"
            title="上传文件到工作区"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder="向 Claude 提问..."
              rows={1}
              disabled={isStreaming}
              className="w-full min-h-[44px] md:min-h-11 resize-none overflow-hidden rounded-xl bg-claude-canvas border border-claude-border text-claude-ink placeholder-claude-muted/60 px-3 md:px-4 py-3 md:py-2 pr-10 md:pr-12 text-[16px] md:text-[15px] leading-relaxed focus:outline-none focus:border-claude-coral/60 focus:ring-2 focus:ring-claude-coral/15 transition-colors duration-200 disabled:opacity-50"
              style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
              aria-label="输入消息"
            />
            <span className="hidden md:flex absolute right-3.5 top-1/2 -translate-y-1/2 flex-col items-center text-[10px] text-claude-muted/40 pointer-events-none font-medium leading-none gap-0.5">
              回车
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 10 4 15 9 20" />
                <path d="M20 4v7a4 4 0 0 1-4 4H4" />
              </svg>
            </span>
          </div>

          {isStreaming ? (
            <button
              type="button"
              onClick={onAbort}
              className="shrink-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-11 md:h-11 -mt-1 md:mt-0 rounded-xl bg-red-600/90 hover:bg-red-600 text-white transition-colors duration-200 shadow-sm hover:shadow-md active:scale-[0.97] flex items-center justify-center"
              aria-label="停止生成"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-11 md:h-11 -mt-1 md:mt-0 rounded-xl bg-claude-coral hover:bg-claude-coral-hover disabled:bg-claude-surface-hover disabled:text-claude-muted/40 text-white transition-colors duration-200 shadow-sm hover:shadow-md disabled:shadow-none active:scale-[0.97] disabled:cursor-not-allowed flex items-center justify-center"
              aria-label="发送消息"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
