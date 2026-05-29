const extIcons = {
  ".pdf": "📄", ".docx": "📝", ".xlsx": "📊", ".pptx": "📽️",
  ".html": "🌐", ".htm": "🌐", ".png": "🖼️", ".jpg": "🖼️",
  ".jpeg": "🖼️", ".gif": "🖼️", ".svg": "🖼️", ".mp4": "🎬",
  ".mp3": "🎵", ".zip": "📦", ".js": "📜", ".mjs": "📜",
  ".json": "📋", ".css": "🎨", ".md": "📖", ".txt": "📃",
};

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FileAttachment({ file, onRemove }) {
  const icon = extIcons[file.ext] || extIcons[file.name] || "📎";
  const isUploading = file.uploading;
  const hasError = file.error;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 md:py-1 rounded-lg text-[14px] md:text-[13px] border transition-colors ${
        hasError
          ? "border-red-400/40 bg-red-500/10 text-red-400"
          : "border-claude-border bg-claude-surface-raised text-claude-body"
      }`}
    >
      {isUploading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-claude-muted/30 border-t-claude-coral rounded-full animate-spin shrink-0" />
      ) : (
        <span className="shrink-0" role="img" aria-label={file.ext || file.name}>
          {icon}
        </span>
      )}
      <span className="truncate max-w-[140px]">{file.name}</span>
      {file.size > 0 && !isUploading && (
        <span className="text-claude-muted/50 text-[11px] shrink-0">{formatSize(file.size)}</span>
      )}
      {hasError && (
        <span className="text-[11px] shrink-0">{file.error}</span>
      )}
      <button
        type="button"
        onClick={() => onRemove(file.name)}
        className="shrink-0 p-1 md:p-0.5 rounded hover:bg-claude-surface-hover text-claude-muted/40 hover:text-claude-body transition-colors ml-0.5"
        aria-label={`移除 ${file.name}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
