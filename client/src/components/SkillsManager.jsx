import { useState, useRef, useEffect } from "react";

const skillIcons = {
  "frontend-design": "🎨", "canvas-design": "🖼️",
  "excel": "📊", "xlsx": "📊", "pdf": "📄",
  "ppt": "📽️", "pptx": "📽️", "word": "📝", "docx": "📝",
  "code-review": "🔍", "debug": "🐛", "batch": "⚡",
  "claude-api": "🤖", "run": "🚀", "verify": "✅",
  "security-review": "🔒", "loop": "🔄",
  "real-estate-expert": "🏠",
};

function getIcon(name) {
  return skillIcons[name] || skillIcons[name.toLowerCase()] || "📦";
}

function SkillItem({ skill, actionLabel, actionClass, onAction, extra, onUse }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [confirming]);

  const handleAction = (e) => {
    e.stopPropagation();
    if (confirming) {
      onAction(skill.name);
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  return (
    <div
      className="group flex items-center gap-2.5 px-3 py-3 md:py-2.5 transition-colors border-l-[3px] border-l-transparent hover:bg-claude-surface-hover cursor-pointer"
      onClick={() => onUse?.(skill.name)}
      title={`点击在对话框中调用 /${skill.name}`}
    >
      <span className="text-base shrink-0" role="img" aria-label={skill.name}>
        {getIcon(skill.name)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-claude-body truncate leading-snug">
          {skill.name}
        </div>
        {skill.description && (
          <div className="text-[11px] text-claude-muted/50 mt-0.5 truncate">
            {skill.description}
          </div>
        )}
        {extra && <div className="mt-0.5">{extra}</div>}
      </div>
      <span className="shrink-0 text-[10px] text-claude-muted/30 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
        使用
      </span>
      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleAction}
            className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${actionClass}`}
            aria-label={`确认${actionLabel}`}
          >
            确认
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            className="text-[11px] px-1.5 py-0.5 rounded bg-claude-surface-raised text-claude-muted hover:text-claude-body border border-claude-border transition-colors"
            aria-label="取消"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          onClick={handleAction}
          className="shrink-0 p-1 md:p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-claude-coral/15 text-claude-muted/40 hover:text-red-400 transition-opacity duration-150"
          title={actionLabel}
          aria-label={`${actionLabel} ${skill.name}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
    </div>
  );
}

function MarketItem({ skill, installed, onInstall, onUse, onDelete }) {
  const handleClick = () => {
    if (installed) onUse?.(skill.name);
  };

  return (
    <div
      className={`group flex items-center gap-2.5 px-3 py-3 md:py-2.5 transition-colors border-l-[3px] border-l-transparent hover:bg-claude-surface-hover ${installed ? "cursor-pointer" : ""}`}
      onClick={handleClick}
      title={installed ? `点击在对话框中调用 /${skill.name}` : ""}
    >
      <span className="text-base shrink-0" role="img" aria-label={skill.name}>
        {getIcon(skill.name)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-claude-body truncate leading-snug">
          {skill.name}
        </div>
        {skill.description && (
          <div className="text-[11px] text-claude-muted/50 mt-0.5 truncate">
            {skill.description}
          </div>
        )}
      </div>
      {installed ? (
        <>
          <span className="text-[11px] text-claude-muted/40 shrink-0 group-hover:hidden">已安装</span>
          <span className="text-[10px] text-claude-muted/30 shrink-0 hidden group-hover:inline pointer-events-none">使用</span>
        </>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onInstall(skill.name); }}
          className="text-[11px] px-2 py-0.5 rounded-md bg-claude-surface-raised hover:bg-claude-surface-hover text-claude-muted hover:text-claude-body border border-claude-border transition-colors duration-150 opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0"
          aria-label={`安装 ${skill.name}`}
        >
          安装
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(skill.name); }}
          className="shrink-0 p-1 md:p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-claude-coral/15 text-claude-muted/40 hover:text-red-400 transition-opacity duration-150"
          title="从市场移除"
          aria-label={`从市场移除 ${skill.name}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function SkillsManager({
  skills, loading, onUpload, onDelete,
  storeSkills, storeLoading, onStoreUpload, onStoreDelete,
  onInstall, onUse,
}) {
  const [tab, setTab] = useState("installed");
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { setError(""); }, [tab]);

  const installedNames = new Set(skills.map((s) => s.name));

  const handleFileChange = async (e, uploadFn) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      await uploadFn(file);
    } catch (err) {
      setError(err.message || "上传失败");
    } finally {
      e.target.value = "";
    }
  };

  const handleInstall = async (name) => {
    setInstalling(name);
    try {
      await onInstall(name);
    } catch (err) {
      setError(err.message || "安装失败");
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Sub tabs */}
      <div className="flex border-b border-claude-border shrink-0 px-3 pt-2.5 gap-1">
        <button
          onClick={() => setTab("installed")}
          className={`text-[13px] md:text-[12px] pb-2 px-1 font-medium transition-colors duration-200 border-b-2 ${
            tab === "installed"
              ? "text-claude-ink border-claude-coral"
              : "text-claude-muted/60 hover:text-claude-body border-transparent"
          }`}
        >
          已安装
        </button>
        <button
          onClick={() => setTab("store")}
          className={`text-[13px] md:text-[12px] pb-2 px-1 font-medium transition-colors duration-200 border-b-2 ${
            tab === "store"
              ? "text-claude-ink border-claude-coral"
              : "text-claude-muted/60 hover:text-claude-body border-transparent"
          }`}
        >
          市场
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 text-[12px] text-red-400 bg-red-500/10 border-b border-red-500/20">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline hover:text-red-300">关闭</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "installed" ? (
          <>
            <div className="px-3 py-2.5 border-b border-claude-border flex items-center justify-between shrink-0">
              <span className="text-[11px] text-claude-muted/60 font-medium">
                {skills.length} 个技能
              </span>
              <button
                onClick={() => inputRef.current?.click()}
                className="text-[11px] px-2 py-0.5 rounded-md bg-claude-surface-raised hover:bg-claude-surface-hover text-claude-muted hover:text-claude-body border border-claude-border transition-colors duration-150"
                aria-label="导入技能"
              >
                + 导入技能
              </button>
              <input ref={inputRef} type="file" accept=".zip" onChange={(e) => handleFileChange(e, onUpload)} className="hidden" />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <span className="inline-block w-4 h-4 border-2 border-claude-muted/30 border-t-claude-muted rounded-full animate-spin" />
              </div>
            ) : skills.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-claude-muted/50 text-center leading-relaxed">
                暂无已安装技能
                <br />
                <span className="text-claude-muted/30">上传 .zip 技能包，或从市场中安装</span>
              </p>
            ) : (
              skills.map((s) => (
                <SkillItem
                  key={s.name}
                  skill={s}
                  actionLabel="删除"
                  actionClass="bg-red-600/80 text-white"
                  onAction={onDelete}
                  onUse={onUse}
                />
              ))
            )}
          </>
        ) : (
          <>
            {storeLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="inline-block w-4 h-4 border-2 border-claude-muted/30 border-t-claude-muted rounded-full animate-spin" />
              </div>
            ) : storeSkills.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-claude-muted/50 text-center leading-relaxed">
                市场中暂无可用技能
              </p>
            ) : (
              storeSkills.map((s) => (
                <MarketItem
                  key={s.name}
                  skill={s}
                  installed={installedNames.has(s.name)}
                  onInstall={handleInstall}
                  onUse={onUse}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
