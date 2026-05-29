import { useState, useRef, useEffect } from "react";

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}

function SessionItem({ session, active, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => {
    if (confirmDelete) {
      const timer = setTimeout(() => setConfirmDelete(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [confirmDelete]);

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setValue(session.title || session.preview);
    setEditing(true);
  };

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(session.id, trimmed);
    }
    setEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete(session.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleKeyDown = (e) => {
    if (editing) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(session.id);
    }
    if (e.key === "Delete") {
      if (confirmDelete) {
        onDelete(session.id);
        setConfirmDelete(false);
      } else {
        setConfirmDelete(true);
      }
    }
  };

  const displayTitle = session.title || session.preview;

  return (
    <div
      onClick={() => onSelect(session.id)}
      onKeyDown={handleKeyDown}
      role="option"
      tabIndex={0}
      aria-selected={active}
      className={`group flex items-center gap-2 px-3 py-3 md:py-2 cursor-pointer transition-colors border-l-[3px] outline-none focus-visible:ring-1 focus-visible:ring-claude-coral/40 ${
        active
          ? "border-l-claude-coral bg-claude-surface-hover/50"
          : "border-l-transparent hover:bg-claude-surface-hover"
      }`}
    >
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-md bg-claude-canvas border border-claude-border text-claude-ink px-2 py-0.5 text-[13px] focus:outline-none focus:border-claude-coral/60 focus:ring-1 focus:ring-claude-coral/15"
            style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
            maxLength={200}
            aria-label="重命名输入"
          />
        ) : (
          <div
            onDoubleClick={handleDoubleClick}
            className={`text-[14px] md:text-[13px] truncate leading-snug ${
              active ? "text-claude-ink font-medium" : "text-claude-body"
            }`}
          >
            {displayTitle}
          </div>
        )}
        <div className="text-[11px] md:text-[10px] text-claude-muted/50 mt-0.5">
          {timeAgo(session.createdAt)}
        </div>
      </div>
      {confirmDelete ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleDeleteClick}
            className="text-[11px] px-2 md:px-1.5 py-1 md:py-0.5 min-h-[32px] rounded bg-red-600/80 text-white transition-colors"
            aria-label="确认删除"
          >
            确认
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
            className="text-[11px] px-2 md:px-1.5 py-1 md:py-0.5 min-h-[32px] rounded bg-claude-surface-raised text-claude-muted hover:text-claude-body border border-claude-border transition-colors"
            aria-label="取消删除"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setValue(session.title || session.preview); setEditing(true); }}
            className="shrink-0 p-1 md:p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-claude-surface-hover text-claude-muted/40 hover:text-claude-body transition-opacity duration-150"
            title="重命名"
            aria-label={`重命名 ${displayTitle}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={handleDeleteClick}
            className="shrink-0 p-1 md:p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-claude-coral/15 text-claude-muted/40 hover:text-red-400 transition-opacity duration-150"
            title="删除会话"
            aria-label={`删除会话 ${displayTitle}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default function SessionList({ sessions, activeId, onSelect, onCreate, onDelete, onRename }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2.5 border-b border-claude-border flex items-center justify-between shrink-0">
        <span className="text-[11px] text-claude-muted/60 font-medium uppercase tracking-wider">
          会话
        </span>
        <button
          onClick={onCreate}
          className="text-[12px] md:text-[11px] px-3 md:px-2 py-1 md:py-0.5 rounded-md bg-claude-surface-raised hover:bg-claude-surface-hover text-claude-muted hover:text-claude-body border border-claude-border transition-colors duration-150"
          aria-label="创建新会话"
        >
          + 新对话
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto" role="listbox" aria-label="会话列表">
        {sessions.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-claude-muted/50 text-center">
            暂无会话
          </p>
        ) : (
          sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))
        )}
      </div>
    </div>
  );
}
