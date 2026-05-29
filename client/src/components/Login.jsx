import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

export default function Login({ onEnter, theme, onToggleTheme }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const switchMode = () => {
    setError("");
    setUsername("");
    setPassword("");
    setConfirm("");
    setMode(isLogin ? "register" : "login");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("请填写用户名和密码");
      return;
    }

    if (!isLogin) {
      if (username.trim().length < 2) {
        setError("用户名至少 2 个字符");
        return;
      }
      if (password.length < 8) {
        setError("密码至少 8 个字符");
        return;
      }
      if (password !== confirm) {
        setError("两次输入的密码不一致");
        return;
      }
    }

    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
    const errorMsg = isLogin ? "登录失败" : "注册失败";

    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || errorMsg);
        return;
      }
      onEnter(data.username, data.token);
    } catch (err) {
      console.error("[login]", err);
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-claude-canvas transition-colors duration-300 relative">
      <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} className="absolute top-2.5 md:top-3.5 right-3 md:right-5" />

      <div className="w-full max-w-sm md:max-w-[380px] mx-auto px-4 md:px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-5 mb-10">
          <img
            src={theme === "dark" ? "/claude-logo-light.png" : "/claude-logo.png"}
            alt="Claude"
            className="h-8 w-auto"
          />
          <p className="text-[14px] text-claude-muted text-center leading-relaxed">
            {isLogin ? "欢迎回来" : "创建你的账户"}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3.5"
        >
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); if (error) setError(""); }}
            placeholder="用户名"
            autoFocus
            className="w-full min-h-[48px] rounded-xl bg-claude-surface border border-claude-border text-claude-ink placeholder-claude-muted/50 px-4 py-3 text-[16px] md:text-[15px] leading-relaxed focus:outline-none focus:border-claude-coral/60 focus:ring-2 focus:ring-claude-coral/15 transition-colors duration-200"
            style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
            aria-label="用户名"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
            placeholder="密码"
            className="w-full min-h-[48px] rounded-xl bg-claude-surface border border-claude-border text-claude-ink placeholder-claude-muted/50 px-4 py-3 text-[16px] md:text-[15px] leading-relaxed focus:outline-none focus:border-claude-coral/60 focus:ring-2 focus:ring-claude-coral/15 transition-colors duration-200"
            style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
            aria-label="密码"
          />

          {!isLogin && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); if (error) setError(""); }}
              placeholder="确认密码"
              className="w-full min-h-[48px] rounded-xl bg-claude-surface border border-claude-border text-claude-ink placeholder-claude-muted/50 px-4 py-3 text-[16px] md:text-[15px] leading-relaxed focus:outline-none focus:border-claude-coral/60 focus:ring-2 focus:ring-claude-coral/15 transition-colors duration-200"
              style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
              aria-label="确认密码"
            />
          )}

          {/* Error */}
          {error && (
            <p className="text-[13px] text-red-400/80 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!username.trim() || !password || (!isLogin && !confirm) || loading}
            className="w-full min-h-[48px] rounded-xl bg-claude-coral hover:bg-claude-coral-hover disabled:bg-claude-surface-hover disabled:text-claude-muted/70 text-white text-[16px] md:text-[15px] font-semibold py-3 transition-colors duration-200 shadow-sm hover:shadow-md disabled:shadow-none active:scale-[0.98] disabled:cursor-not-allowed mt-1"
          >
            {loading ? "处理中..." : isLogin ? "登录" : "注册"}
          </button>
        </form>

        {/* Switch mode */}
        <p className="text-center mt-5 text-[13px] text-claude-muted/60">
          {isLogin ? "还没有账户？" : "已有账户？"}
          <button
            onClick={switchMode}
            className="ml-1 text-claude-coral hover:text-claude-coral-hover font-medium transition-colors py-1"
          >
            {isLogin ? "立即注册" : "返回登录"}
          </button>
        </p>

        {/* Footer */}
        <p className="text-center mt-8 text-[12px] text-claude-muted/40">
          Claude Code Nexus
        </p>
      </div>
    </div>
  );
}
