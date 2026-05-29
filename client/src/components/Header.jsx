import { useState, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "早上好";
  if (h >= 12 && h < 18) return "下午好";
  return "晚上好";
}

function Greeting({ user }) {
  return (
    <span className="text-[12px] text-claude-muted/60 font-medium">
      {getGreeting()}，{user}
    </span>
  );
}

export default function Header({ theme, onToggleTheme, user, onLogout, onToggleSidebar, sidebarOpen }) {
  const [version, setVersion] = useState("");

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => {
        const v = (data.version || "").split(" ")[0];
        setVersion(v ? `Claude Code v${v}` : `Claude Code ${data.version || ""}`);
      })
      .catch(() => {});
  }, []);

  return (
    <header className="flex items-center justify-between px-3 md:px-5 py-2 md:pt-5 md:pb-4 border-b border-claude-border bg-claude-surface shrink-0 relative">
      {/* Left: sidebar toggle + greeting/logout + version */}
      <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
        <div className="flex items-center gap-3 mt-5 md:mt-0">
          <button
            onClick={onToggleSidebar}
            className="p-2 md:p-1.5 rounded-lg text-claude-muted hover:text-claude-body hover:bg-claude-surface-hover transition-colors duration-200 flex items-center justify-center"
            title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            aria-expanded={sidebarOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 md:w-4 md:h-4">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <button
            onClick={onLogout}
            className="text-[12px] md:text-[11px] text-claude-muted/40 hover:text-claude-coral transition-colors duration-200"
            aria-label="退出登录"
          >
            退出
          </button>
        </div>
        <Greeting user={user} />
      </div>

      <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} className="absolute top-1/2 -translate-y-1/2 right-3 md:right-5" />

      {/* Logo — absolutely centered */}
      <img
        src={theme === "dark" ? "/claude-logo-light.png" : "/claude-logo.png"}
        alt="Claude"
        className="absolute left-1/2 -translate-x-1/2 top-10 md:top-3.5 h-7 w-auto -mt-0.5"
      />

      {/* Version — absolutely centered below logo */}
      {version && (
        <span className="absolute bottom-2.5 md:bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] text-claude-muted/50 font-medium tracking-wide">
          {version}
        </span>
      )}

    </header>
  );
}
