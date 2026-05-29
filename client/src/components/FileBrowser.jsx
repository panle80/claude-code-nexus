import { useState, useEffect, useCallback } from "react";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.floor(hr / 24)} 天前`;
}

const extIcons = {
  ".pdf": "📄", ".docx": "📝", ".xlsx": "📊", ".pptx": "📽️",
  ".html": "🌐", ".htm": "🌐", ".png": "🖼️", ".jpg": "🖼️",
  ".jpeg": "🖼️", ".gif": "🖼️", ".svg": "🖼️", ".mp4": "🎬",
  ".mp3": "🎵", ".zip": "📦", ".js": "📜", ".mjs": "📜",
  ".json": "📋", ".css": "🎨", ".md": "📖", ".txt": "📃",
};

function FileItem({ file: f, token, onDeleted }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [confirming]);

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/files/download?path=${encodeURIComponent(f.name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const inlineExts = [".html", ".htm", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".pdf", ".txt", ".md", ".json", ".mp3", ".mp4", ".webm"];
      if (inlineExts.includes(f.ext)) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("[download]", err);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (confirming) {
      try {
        await fetch(`/api/files?path=${encodeURIComponent(f.name)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        onDeleted();
      } catch (err) {
        console.error("[delete]", err);
      }
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  return (
    <div
      onClick={handleDownload}
      className="group flex items-center gap-2.5 px-3 py-3 md:py-2.5 transition-colors border-l-[3px] border-l-transparent hover:bg-claude-surface-hover cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") handleDownload(); }}
    >
      <span className="text-base shrink-0">
        {extIcons[f.ext] || "📎"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-claude-body truncate leading-snug">
          {f.name}
        </div>
        <div className="text-[10px] text-claude-muted/50 mt-0.5">
          {formatSize(f.size)} · {timeAgo(f.modifiedAt)}
        </div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleDelete}
            className="text-[11px] px-2 md:px-1.5 py-1 md:py-0.5 min-h-[32px] rounded bg-red-600/80 text-white transition-colors"
            aria-label="确认删除"
          >
            确认
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            className="text-[11px] px-2 md:px-1.5 py-1 md:py-0.5 min-h-[32px] rounded bg-claude-surface-raised text-claude-muted hover:text-claude-body border border-claude-border transition-colors"
            aria-label="取消删除"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            className="p-1 md:p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-claude-surface-hover text-claude-muted/40 hover:text-claude-body transition-opacity duration-150"
            title="下载"
            aria-label={`下载 ${f.name}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className="shrink-0 p-1 md:p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-claude-coral/15 text-claude-muted/40 hover:text-red-400 transition-opacity duration-150"
            title="删除文件"
            aria-label={`删除 ${f.name}`}
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

export default function FileBrowser({ token }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/files", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error("[fetchFiles]", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2.5 border-b border-claude-border flex items-center justify-between shrink-0">
        <span className="text-[11px] text-claude-muted/60 font-medium uppercase tracking-wider">
          文件
        </span>
        <button
          onClick={fetchFiles}
          className="text-[11px] px-2 py-0.5 rounded-md bg-claude-surface-raised hover:bg-claude-surface-hover text-claude-muted hover:text-claude-body border border-claude-border transition-colors duration-150"
          aria-label="刷新文件列表"
        >
          刷新
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="inline-block w-4 h-4 border-2 border-claude-muted/30 border-t-claude-muted rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-claude-muted/50 text-center leading-relaxed">
            暂无文件
            <br />
            <span className="text-claude-muted/30">
              Claude 生成的文件会出现在这里
            </span>
          </p>
        ) : (
          files.map((f) => (
            <FileItem key={f.name} file={f} token={token} onDeleted={fetchFiles} />
          ))
        )}
      </div>
    </div>
  );
}
