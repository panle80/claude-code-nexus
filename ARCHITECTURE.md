# Claude Code Nexus 架构文档

## 四层架构总览

```
用户浏览器 (https://claude.panle80.cn:8443)
    │  ← 路由器端口映射 8443→8443（透传）
    ▼
┌──────────────────────────────────────────────────────┐
│  第一层：Nginx 反向代理                                 │
│  文件：/etc/nginx/sites-enabled/claude-code-nexus      │
│  端口：8443                                             │
│  职责：SSL 终止、安全头、限流、静态文件、API 转发        │
└──────────────┬──────────────┬─────────────────────────┘
               │              │
    静态文件请求  │              │ /api/* 请求
               ▼              ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ 第二层：Client 客户端  │  │ 第三层：Server 服务器      │
│ 目录：client/         │  │ 目录：server/             │
│ React 18 + Vite 5     │  │ Express 4 + Node          │
│ 产出 → dist/          │  │ 端口：[::1]:3001           │
└──────────────────────┘  └──────────┬────────────────┘
                                     │
                          ┌──────────▼───────────┐
                          │ 第四层：Data + Logs    │
                          │ 目录：data/ + logs/   │
                          │                      │
                          │ data/users/<用户名>/  │
                          │   .password           │  ← bcrypt 哈希
                          │   home/.claude/       │  ← API 配置
                          │   workspace/          │  ← CLI cwd
                          │   sessions/           │  ← JSONL + titles.json
                          └──────────────────────┘
```

---

## 第一层：Nginx

**部署位置：** `/etc/nginx/sites-enabled/claude-code-nexus`  
**参考副本：** 项目根目录 `nginx-site.conf`

**核心职责：**

| 功能 | 说明 |
|------|------|
| 端口监听 | 8443（ISP 封锁 80/443，路由器映射外网 8443→本机 8443）|
| SSL/TLS | TrustAsia DV 证书（`/etc/nginx/ssl/`）|
| 安全头 | CSP、HSTS (`max-age=63072000`)、X-Frame-Options DENY、X-XSS-Protection、Referrer-Policy |
| 静态文件 | 托管 `client/dist/`，静态资源 30 天强缓存 (`immutable`) |
| API 转发 | `/api/*` → `[::1]:3001`（IPv6 回环），`proxy_buffering off` 支持 SSE 流式，`X-Forwarded-For` 直接设为 `$remote_addr` 防 IP 伪造 |
| 限流 | auth (`limit_req zone=auth`, 10/min, burst 3)，chat (`limit_req zone=chat`, 30/min, burst 2) |
| 日志 | `access_log /var/log/nginx/claude-access.log`，`error_log /var/log/nginx/claude-error.log` |

**排错速查：**

| 现象 | 查什么 |
|------|--------|
| 网站完全打不开 | `systemctl status nginx` |
| 配置语法错误 | `nginx -t` |
| API 报 502/504 | `ss -tlnp \| grep 3001` — Server 进程是否在跑 |
| SSL 报错 | 证书过期？`openssl x509 -in /etc/nginx/ssl/claude.panle80.cn_bundle.crt -noout -dates` |
| 实时日志 | `tail -f /var/log/nginx/claude-error.log` |

**常用命令：**

```bash
systemctl status nginx
nginx -t
systemctl reload nginx
ss -tlnp | grep nginx
```

---

## 第二层：Client

**位置：** `client/`  
**技术：** React 18 + Vite 5 + Tailwind CSS 3

| 模式 | 命令 | 端口 | 场景 |
|------|------|------|------|
| 开发 | `npm run dev` | 5173 | 热更新，API 代理到 `:3001` |
| 生产 | `npm run build` → dist/ | - | Nginx 直接托管 |

**排错：**

| 现象 | 查什么 |
|------|--------|
| 白屏/样式乱 | 浏览器 F12 → Console / Network |
| 按钮没反应 | F12 → Network → 看 /api 请求 |
| 登录失败 | Network 返回码 → 大概率 Server 层 |
| 渲染崩溃 | ErrorBoundary 捕获显示重载按钮 |

---

## 第三层：Server

**位置：** `server/`  
**技术：** Express 4 + JWT + bcryptjs + helmet + morgan + express-rate-limit  
**进程管理：** systemd（`claude-code-nexus.service`）

**中间件链：** requestId → morgan → helmet → cors → body parser (10MB) → rate limiters → auth

**路由组：** 每组挂载在独立 `/api` 子前缀下，中间件不跨组泄漏：

| 路由组 | Auth | Express 限流 | 说明 |
|--------|------|-------------|------|
| `/api/health`, `/api/version` | 无 | general (100/min) | 健康检查 |
| `/api/auth/*` | 无 | auth (10/min) | 注册、登录、取用户信息 |
| `/api/chat` | JWT | chat (5/min) | AI 对话，SSE 流式 |
| `/api/sessions/*` | JWT | 无（依赖 Nginx） | 会话 CRUD |
| `/api/skills/*` | JWT | skills (20/min) | 用户技能安装/删除 |
| `/api/store/*` | JWT | skills (20/min) | 技能市场（管理员上传/删除） |
| `/api/files/*` | JWT | skills (20/min) | 工作空间文件管理 |

**关键机制：**

- **Claude 版本缓存：** 启动时 `claude --version`，首次 `/api/version` 未命中则 lazy-retry + waiter 队列
- **优雅退出：** SIGTERM/SIGINT → `server.close()`，15 秒超时强制退出
- **路径安全：** 所有磁盘操作经 `safeResolve` + `resolveSessionPath`，会话 ID 仅允许 `/^[a-z0-9]+$/i`
- **SSE 出口统一：** `finalize()` 防双重 `res.end()`，`send()` 检查 `res.writableEnded`
- **冷启动保护：** `claude -p` + prompt 作为 CLI 参数传递（非 stdin pipe），避免 claude Bun 二进制解压初始化时 stdin 被过早关闭导致的零输出 bug
- **免权限弹窗：** `--dangerously-skip-permissions` 绕过所有交互式权限提示，适配 headless/Web GUI 后端场景
- **并发安全：** `fileLock` 文件级互斥锁，保护 JSONL 追加和 `titles.json` 读写，防止并发请求损坏会话数据
- **技能文件隔离：** Claude cwd 设为 `tmp/`，产出的 .pdf/.pptx/.docx/.xlsx/.png/.html 等文件自动移回 `workspace/`，中间脚本留在 `tmp/` 下次请求时清理
- **响应上限：** stdout 总量 50MB（支持大文件文档生成）、文本内容 1MB

**排错速查：**

| 现象 | 查什么 |
|------|--------|
| 所有 API 502/504 | `ss -tlnp \| grep 3001` 看进程是否在 |
| 启动就崩 | `.env` 里 `JWT_SECRET` 设了没，`cd server && npm install` |
| AI 不回复 | `which claude`，API key 有效？ |
| 会话操作失败 | `ls data/users/<名>/sessions/` 看文件权限 |

**常用命令：**

```bash
ss -tlnp | grep 3001
systemctl status claude-code-nexus
sudo systemctl restart claude-code-nexus
journalctl -u claude-code-nexus -f
```

---

## 第四层：Data + Logs

**位置：** `data/` + `logs/`

```
data/users/<用户名>/
    .password          ← bcrypt 哈希（10 轮）
    home/              ← Claude CLI HOME 目录
        .claude/settings.json  ← 注册时注入 API 凭证（flag: "wx" 防覆盖）
        .claude/skills/        ← 用户安装的技能（SKILL.md）
    workspace/         ← 输出文件存放（PDF/PPTX/DOCX/XLSX 等最终产物）
    tmp/               ← Claude CLI 工作目录（cwd），中间脚本和构建产物，请求间自动清理
    sessions/          ← JSONL 对话记录 + titles.json
```

**共享数据：** `data/skills-store/` — 技能市场，管理员上传管理，所有用户可安装。

**安全措施：** 路径全量 `safeResolve` 校验，`genId` 生成会话 ID，不信任用户输入。

**排错：**

| 现象 | 查什么 |
|------|--------|
| 用户数据丢失 | `ls data/users/` |
| 会话不见了 | `ls data/users/<名>/sessions/` |
| 权限报错 | Server 进程是否可读写 `data/` 和 `logs/` |
| 密码始终失败 | `.password` 文件是否损坏 |

---

## 启动流程

```
Windows 用户登录
  → 打开终端，输入 wsl 唤醒 WSL2 VM
    → systemd 自动启动 claude-code-nexus.service (Express :3001)
    → systemd 自动启动 nginx.service (:8443 SSL + 静态文件)
```

**部署文件：**

| 文件 | 部署位置 | 说明 |
|------|----------|------|
| `claude-code-nexus.service` | `/etc/systemd/system/` | systemd 服务 |
| `nginx-site.conf` | `/etc/nginx/sites-enabled/` | Nginx 站点配置 |
| `.env` | 项目根目录 | 环境变量（JWT_SECRET、ANTHROPIC_*） |

---

## 问题定位

```
页面打不开 → 第一层 Nginx  → systemctl status nginx + nginx -t
功能异常   → 第二层 Client → 浏览器 F12 → Console / Network
API 失败   → 第三层 Server → ss -tlnp | grep 3001 + journalctl -f
数据丢失   → 第四层 Data   → ls data/users/
```

代码级排错（文件/路由/测试）→ [CLAUDE.md](./CLAUDE.md)
