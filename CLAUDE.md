# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project overview

A web-based GUI for Claude Code CLI — Cursor-like chat experience with streaming, Markdown rendering, and multi-user isolation. React 18 + Vite 5 frontend, Express.js backend, JWT auth, SSE streaming, systemd + Nginx production stack. Runs on Ubuntu 24.04 (VM). Responsive design with `md:` (768px) breakpoint — drawer sidebar on mobile, inline on desktop.

## Common commands

```bash
# Install all dependencies (root, server, client)
npm run install:all

# Dev mode — backend :3001 + frontend :5173
npm run dev

# Build frontend for production
cd client && npm run build

# Run all tests
cd server && npm test              # 56 tests
cd client && npm test              # 7 component tests

# Production
sudo systemctl restart claude-code-nexus
journalctl -u claude-code-nexus -f
sudo systemctl reload nginx
```

## Architecture

```
Browser (HTTPS) → Nginx (:8443) → Express (:3001) → Claude CLI (spawn)
                      │                    │                │
                 static files         JWT verify         cwd: tmp/ (isolated)
                 SSL terminate        rate-limit         HOME: home/
```

**Deployment**: Everything runs inside a VM with Ubuntu 24.04, managed by systemd. Nginx handles SSL termination and serves `client/dist/`. Express listens on `[::1]:3001` (IPv6 loopback, not exposed). ISP blocks 80/443 → production uses 8443 via router port mapping.

## Server entry (`server/index.js`)

- **Middleware chain**: `requestId` (8-char UUID) → `morgan` → `helmet` (CSP off, Nginx handles) → `cors` (origin whitelist) → `express.json(10mb)` → rate limiters → routes
- `app.set("trust proxy", 1)` — required for correct `req.ip` behind Nginx
- **Claude version cache**: exec at startup, lazy-retry with waiter queue on first `/api/version`
- **Graceful shutdown**: `server.close()` on SIGTERM/SIGINT, 15s force-exit timeout
- **Rate limiters** isolated per route prefix:
  - auth (10/min) at `/api/auth`
  - chat (5/min) at `/api/chat`
  - general (100/min) at `/api/health|version`
  - `/api/sessions` left to Nginx-only rate limiting

## Route structure

Each router mounted at its own `/api` sub-prefix so middleware doesn't leak across groups:

```
app.use("/api/auth", authLimiter, authRouter)       → /register, /login, /me
app.use("/api/chat", requireAuth, chatLimiter, chatRouter)  → /
app.use("/api/sessions", requireAuth, sessionsRouter) → /, /:id, /:id/title, /:id/messages
app.use("/api/skills", requireAuth, skillsLimiter, skillsRouter) → /, /:name, /upload, /install
app.use("/api/store", requireAuth, skillsLimiter, storeRouter) → / (只读)
app.use("/api/files", requireAuth, skillsLimiter, filesRouter) → /, /download, (DELETE /)
```

### Auth flow (`server/routes/auth.js`)
- POST `/api/auth/register` — 8-char min password, bcrypt 10 rounds, `fs.writeFile(flag: "wx")` for TOCTOU prevention
- POST `/api/auth/login` — lazily-initialized dummy hash for non-existent users (timing-attack defense)
- GET `/api/auth/me` — validate JWT, return username
- `ensureUserDirs` creates `workspace/`, `tmp/`, `home/`, `home/.claude/`, `home/.claude/skills/`, and seeds `settings.json` with `ANTHROPIC_*` env vars

### Chat flow (`server/routes/chat.js`)
- POST `/api/chat` → `validateSessionId` + `resolveSessionPath` (safeResolve-wrapped)
- **Skill file isolation**: Before spawn, snapshots workspace file names (`workspaceBefore` Set), cleans `tmp/`, copies workspace files in, then spawns Claude with `cwd: tmp/`. After process exits, only copies back files that were NOT in the pre-chat snapshot (i.e., Claude actually created), leaving intermediate scripts (.js/.py etc.) in `tmp/` where they are cleaned on next request. This preserves original timestamps on existing workspace files and keeps `workspace/` free of build artifacts like `generate_pdf.js`.
- Spawns `claude -p --permission-mode acceptEdits --bare --output-format stream-json --include-partial-messages --verbose <prompt>` wrapped in `bwrap` sandbox — filesystem confined to user's `tmp/`, `home/`, `workspace/` only, preventing access to project source and other users' data; prompt passed as CLI argument (not stdin) to avoid cold-start race condition; `proc.stdin.end()` immediately after spawn
- Response capped at 50MB total stdout (for document generation like PDF) and 1MB text content
- SSE streaming with `finalize()` unified exit (prevents double-res.end race), `send()` guards `res.writableEnded`
- `proc.kill("SIGTERM")` wrapped in try/catch
- Uploaded files land in user's workspace (Claude's cwd); frontend prepends `[上传的文件]\n- file1\n- file2\n\n` to prompt when attachments are present

### Sessions (`server/routes/sessions.js`)
- All `/:id` routes use `requireValidSession` middleware
- Message objects in POST body validated per-field (role, content, length)

### Skills (`server/routes/skills.js`)
- Skills stored as `SKILL.md` (YAML frontmatter + markdown body) per Claude Code standard
- `readSkill()` parses frontmatter via `gray-matter`, falls back to legacy `skill.json`
- `requireValidSkill` middleware validates name (`/^[a-z][a-z0-9-]*$/i`) + path traversal via `resolveSkillPath`
- POST `/api/skills/upload` — accept `.zip` (multer memoryStorage, 10MB), find `SKILL.md` inside, extract all files
- POST `/api/skills/install` — copy skill from `data/skills-store/` to user's `home/.claude/skills/`

### Skills marketplace (`server/routes/store.js`)
- `data/skills-store/` — shared skill repository, read-only for all users
- `syncFromSystemSkills()` — lazy sync on GET `/api/store`: copies new skills from `~/.claude/skills/` into the store so CLI-installed skills automatically appear in the marketplace
- GET `/api/store` — list marketplace skills (all authenticated users); triggers sync before listing

### Workspace files (`server/routes/files.js`)
- GET `/api/files` — list files in user's `workspace/` with size/date/extension
- GET `/api/files/download?path=` — serve file with correct MIME type; inline for viewable types (HTML/PDF/images), attachment for others
- POST `/api/files/upload` — upload file to workspace (multer memoryStorage, 20MB limit); `path.basename()` sanitizes filenames; duplicate names auto-suffixed `_1`, `_2`, etc.
- DELETE `/api/files?path=` — delete file; path traversal blocked by `safeResolve`
- Frontend downloads via `fetch()` + blob URL (carries Bearer token), not direct anchor links

## Shared utilities (`server/utils.js`)

- `DATA_ROOT` — `data/users/`; `STORE_DIR` — `data/skills-store/`
- `safeResolve`, `resolveSessionPath`, `resolveSkillPath` — path traversal guards; normalizes forward/backslash before comparison
- `userDir(username)`, `workspaceDir`, `homeDir`, `tmpDir`, `sessionsDir`, `skillsDir(username)`, `storeDir()`, `sessionFile` — path helpers
- `genId()`, `validateSessionId(id)`, `validateSkillName(name)` — validation: session ID `/^[a-z0-9]+$/i`, skill name `/^[a-z][a-z0-9-]*$/i`
- `appendMessages(username, sessionId, msgs)` — async append with internal safeResolve guard; auto-creates sessions dir, adds timestamp, newline-delimited JSONL
- `fileLock(key)` — per-file mutex; serialises concurrent writes to the same file to prevent JSONL/title corruption
- `parseJsonlAsync(path)`, `parseJsonlString(str)` — async preferred for large files; sync version available for simpler cases

## User isolation

Each user gets `data/users/{username}/` with:
- `workspace/` — final output files land here (browsable via FileBrowser)
- `tmp/` — Claude CLI cwd; intermediate scripts and build artifacts stay here, cleaned per-request
- `home/` — Claude CLI HOME
- `home/.claude/skills/` — user-installed skills (Claude Code reads from `$HOME/.claude/skills/`)
- `sessions/` — JSONL files + `titles.json`

On register/login, `ensureUserDirs` creates workspace/home/tmp directories and writes `home/.claude/settings.json` with API credentials. `sessions/` is lazily created on first session use.

Shared marketplace: `data/skills-store/` — read-only, all users can install from via `/api/skills/install`.

## Frontend hooks

- `useSessions.js` — session CRUD, localStorage hydration. Exposes `initialMessages` for the compositor.
- `useMessages.js` — SSE streaming, message state, `lastPromptRef` (retry support), `setMessages` exposed.
- `useChat.js` — compositor: wires `useSessions` + `useMessages`. Feeds `initialMessages` into `useMessages` via `useEffect`. Wraps `loadSession` for manual session switch.
- `useTheme.js` — dark/light toggle, system preference follow.
- `useSkills.js` — installed skills CRUD: fetch, upload(zip), delete, install(from marketplace). All calls carry Bearer token.
- `useStore.js` — marketplace fetch. All calls carry Bearer token.

## Frontend components

- `ErrorBoundary.jsx` — class component, catches render crashes, shows reload button
- `App.jsx` — 3-tab sidebar (会话/技能/文件), validates JWT on mount
- `ThemeToggle.jsx` — shared sun/moon SVG, used by Login + Header
- `Login.jsx` — form with client validation, `transition-colors`, aria-labels
- `Header.jsx` — greeting, sidebar toggle (`aria-expanded`), logout, version centered below logo (absolute positioning), theme toggle vertically centered
- `SessionList.jsx` — keyboard-navigable (`role="option" tabIndex="0"`), inline delete confirmation
- `ChatArea.jsx` — `role="log" aria-live="polite"`, skeleton loading, auto-scroll (instant during stream, smooth on idle)
- `ChatMessage.jsx` — `React.memo`, copy feedback, retry button on error, teal inline code/links; streaming cursor uses `animate-cursor-blink` (sharp step-end blink + coral glow), thinking indicator with `details/summary`
- `ChatInput.jsx` — auto-resize textarea, Enter to send, Shift+Enter newline, paperclip upload button (hidden `<input type="file" multiple>`), attachment tags above input; accepts `prefill`/`onPrefillConsumed` for skill-triggered prefill; `items-center` alignment for input-row centering
- `FileAttachment.jsx` — attachment chip: icon + filename + size + remove (X); shows spinner during upload, red border on error
- `SkillsManager.jsx` — sub-tabs (已安装/市场), skill list with name-to-emoji icon mapping; click-to-use prefills `/<skill-name>` in chat; `MarketItem` component used for all users in marketplace tab (shows "安装" for uninstalled / "已安装" for installed); two-click confirm patterns for destructive actions
- `FileBrowser.jsx` — workspace file list with size/date, click to download (fetch+blob), hover shows download + delete buttons; two-click confirm delete

## Responsive design

- **Breakpoint**: `md:` (768px) — below = mobile (drawer overlay), above = desktop (inline sidebar)
- **Sidebar**: desktop `hidden md:flex w-[260px]` inline, mobile fixed overlay drawer (280px, `animate-slide-in`, backdrop click to close)
- **Hover fallback**: all `opacity-0 group-hover:opacity-100` patterns use `opacity-100 md:opacity-0 md:group-hover:opacity-100` — action buttons always visible on touch devices; also `@media (hover: none) and (pointer: coarse)` CSS rule as belt-and-suspenders
- **Touch targets**: all interactive elements `min-h-[44px] min-w-[44px]` on mobile (Apple HIG)
- **iOS zoom prevention**: input fields use `text-[16px] md:text-[15px]` — 16px minimum prevents Safari auto-zoom
- **Max-width removal**: content areas use `max-w-full md:max-w-[900px]` — full-width on mobile, constrained on desktop
- **Markdown overflow**: tables and code blocks have `overflow-x: auto` for horizontal scroll on narrow screens
- **PWA safe areas**: `env(safe-area-inset-*)` padding for notched phones in standalone mode
- **Zero new dependencies**: all responsive behavior via Tailwind prefixes + minimal CSS — no JS breakpoint libraries

## Key constraints

- **CJK fonts**: Required for PDF/Word/PPT generating skills to render Chinese text. Install with `apt install fonts-noto-cjk` (provides Noto Sans/Serif CJK SC).
- **JWT_SECRET must be set** in `.env` — server refuses to start without it (`process.exit(1)`)
- **ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL** (plus `_DEFAULT_HAIKU/SONNET/OPUS_MODEL`) — set in `.env` for API-compatible endpoints; code gracefully skips missing values
- **USER_DATA_ROOT must be an absolute path** — relative paths cause `safeResolve` failures
- **Password minimum 8 characters** — enforced at registration only
- **Skills format** — Claude Code standard: `SKILL.md` with YAML frontmatter (`name`, `description`) + markdown body. Legacy `skill.json` still readable as fallback.
- **CSS transitions**: use `transition-colors` not `transition-all`
- **Custom animations**: `animate-cursor-blink` (1s step-end blink) in `index.css` for streaming/thinking cursors
- **Rate limiting**: dual-layer — Express for dev, Nginx for production; skills/store/files share 20/min limiter
- **Nginx config**: reference copy is `nginx-site.conf`; systemd: `claude-code-nexus.service`

## Testing

- **Framework**: vitest (server and client)
- **Server** (5 files, 56 tests): `utils.test.js`, `auth.test.js`, `sse-parser.test.js`, `sessions.test.js`, `chat.test.js`
- **Client** (2 files, 7 tests): `Login.test.jsx`, `ChatInput.test.jsx`

## Startup flow

```
VM boot → systemd auto-starts claude-code-nexus.service (:3001)
       → systemd auto-starts nginx.service (:8443)
```

Both services `systemctl enable`'d — start automatically when the VM boots.
