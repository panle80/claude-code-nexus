import { useState, useEffect } from "react";
import Header from "./components/Header";
import ChatArea from "./components/ChatArea";
import ChatInput from "./components/ChatInput";
import Login from "./components/Login";
import SessionList from "./components/SessionList";
import SkillsManager from "./components/SkillsManager";
import FileBrowser from "./components/FileBrowser";
import ErrorBoundary from "./components/ErrorBoundary";
import { useChat, SESSION_KEY } from "./hooks/useChat";
import { useSkills } from "./hooks/useSkills";
import { useStore } from "./hooks/useStore";
import { useTheme } from "./hooks/useTheme";

const AUTH_KEY = "claude-web-ide-auth";

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.token || !data.username) return null;
    return data;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [init, setInit] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("sessions");
  const [skillToUse, setSkillToUse] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const {
    messages, isStreaming, sendMessage, retry, abort, clearMessages,
    sessionId, sessions, loadSession, createSession, deleteSession, renameSession, hydrated,
  } = useChat(token);
  const { skills, loading: skillsLoading, fetchSkills, uploadSkill, deleteSkill, installSkill } = useSkills(token);
  const { storeSkills, storeLoading, fetchStore, uploadToStore, deleteFromStore } = useStore(token);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const saved = loadAuth();
    if (saved) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${saved.token}` },
      })
        .then(async (res) => {
          if (res.ok) {
            const userData = await res.json();
            setUser(userData.username);
            setToken(saved.token);
          } else {
            localStorage.removeItem(AUTH_KEY);
          }
        })
        .catch((err) => { console.error("[auth] token validation failed:", err.message); })
        .finally(() => setInit(false));
    } else {
      setInit(false);
    }
  }, []);

  useEffect(() => {
    if (token) { fetchSkills(); fetchStore(); }
  }, [token]);

  const handleLogin = (username, token) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ username, token }));
    setToken(token);
    setUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setToken(null);
    clearMessages();
  };

  const handleAddFile = async (file) => {
    const placeholder = {
      name: file.name,
      size: 0,
      ext: "." + (file.name.split(".").pop() || "").toLowerCase(),
      uploading: true,
      error: null,
    };
    setAttachments((prev) => [...prev, placeholder]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");

      setAttachments((prev) =>
        prev.map((a) =>
          a.name === file.name ? { ...data.file, uploading: false, error: null } : a
        )
      );
    } catch (err) {
      setAttachments((prev) =>
        prev.map((a) =>
          a.name === file.name ? { ...a, uploading: false, error: err.message } : a
        )
      );
    }
  };

  const handleRemoveAttachment = (name) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  };

  const handleSendMessage = (prompt) => {
    const readyAttachments = attachments.filter((a) => !a.uploading && !a.error);
    let finalPrompt = prompt;
    if (readyAttachments.length > 0) {
      const fileList = readyAttachments.map((a) => `- ${a.name}`).join("\n");
      finalPrompt = `[上传的文件]\n${fileList}\n\n${prompt}`;
    }
    sendMessage(finalPrompt);
    setAttachments([]);
  };

  if (init) {
    return (
      <div className="h-screen flex items-center justify-center bg-claude-canvas">
        <span className="text-claude-muted">加载中...</span>
      </div>
    );
  }

  const handleSelectSession = (id) => {
    loadSession(id);
    setMobileDrawerOpen(false);
  };

  const handleSkillUse = (name) => {
    setSkillToUse(`/${name} `);
    setMobileDrawerOpen(false);
  };

  if (!user) {
    return <Login onEnter={handleLogin} theme={theme} onToggleTheme={toggleTheme} />;
  }

  const sidebarContent = (
    <>
      <div className="flex border-b border-claude-border shrink-0">
        <button
          onClick={() => setSidebarTab("sessions")}
          className={`flex-1 text-[12px] py-2.5 font-medium transition-colors duration-200 ${
            sidebarTab === "sessions"
              ? "text-claude-ink border-b-2 border-claude-coral"
              : "text-claude-muted/60 hover:text-claude-body border-b-2 border-transparent"
          }`}
        >
          会话
        </button>
        <button
          onClick={() => setSidebarTab("skills")}
          className={`flex-1 text-[12px] py-2.5 font-medium transition-colors duration-200 ${
            sidebarTab === "skills"
              ? "text-claude-ink border-b-2 border-claude-coral"
              : "text-claude-muted/60 hover:text-claude-body border-b-2 border-transparent"
          }`}
        >
          技能
        </button>
        <button
          onClick={() => setSidebarTab("files")}
          className={`flex-1 text-[12px] py-2.5 font-medium transition-colors duration-200 ${
            sidebarTab === "files"
              ? "text-claude-ink border-b-2 border-claude-coral"
              : "text-claude-muted/60 hover:text-claude-body border-b-2 border-transparent"
          }`}
        >
          文件
        </button>
      </div>
      {sidebarTab === "files" ? (
        <FileBrowser token={token} />
      ) : sidebarTab === "sessions" ? (
        <SessionList
          sessions={sessions}
          activeId={sessionId}
          onSelect={handleSelectSession}
          onCreate={clearMessages}
          onDelete={deleteSession}
          onRename={renameSession}
        />
      ) : (
        <SkillsManager
          skills={skills}
          loading={skillsLoading}
          onUpload={uploadSkill}
          onDelete={deleteSkill}
          storeSkills={storeSkills}
          storeLoading={storeLoading}
          onStoreUpload={uploadToStore}
          onStoreDelete={deleteFromStore}
          onInstall={installSkill}
          onUse={handleSkillUse}
        />
      )}
    </>
  );

  return (
    <ErrorBoundary>
    <div className="h-screen flex flex-col bg-claude-canvas transition-colors duration-300">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={handleLogout}
        onToggleSidebar={() => {
          if (window.innerWidth < 768) {
            setMobileDrawerOpen(prev => !prev);
          } else {
            setSidebarOpen(prev => !prev);
          }
        }}
        sidebarOpen={sidebarOpen}
      />
      <div className="flex-1 flex min-h-0">
        {/* Desktop sidebar */}
        <div className="hidden md:flex w-[260px] shrink-0 border-r border-claude-border bg-claude-surface flex-col">
          {sidebarOpen && sidebarContent}
        </div>

        {/* Mobile drawer */}
        {mobileDrawerOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] bg-claude-surface border-r border-claude-border z-50 flex flex-col shadow-2xl animate-slide-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-claude-border shrink-0">
                <span className="text-[13px] font-semibold text-claude-ink">导航</span>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="关闭侧边栏"
                  className="p-2 rounded-lg text-claude-muted hover:text-claude-body hover:bg-claude-surface-hover transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {sidebarContent}
            </div>
          </>
        )}

        {/* Center — Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {!hydrated ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="inline-block w-5 h-5 border-2 border-claude-muted/30 border-t-claude-muted rounded-full animate-spin" />
            </div>
          ) : (
            <ChatArea messages={messages} theme={theme} isStreaming={isStreaming} loading={!hydrated} onRetry={retry} />
          )}
          <ChatInput
            onSend={handleSendMessage}
            onAbort={abort}
            isStreaming={isStreaming}
            prefill={skillToUse}
            onPrefillConsumed={() => setSkillToUse(null)}
            attachments={attachments}
            onAddFile={handleAddFile}
            onRemoveAttachment={handleRemoveAttachment}
          />
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
