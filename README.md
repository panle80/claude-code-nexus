# Claude Code Nexus

基于 Web 的 Claude Code CLI 图形界面，提供类似 Cursor IDE 的聊天体验。支持多用户注册、技能市场、文件管理、文档生成（PDF/PPTX/DOCX/XLSX），每位用户拥有独立工作空间。

---

## 当前部署

| 项目 | 值 |
|------|-----|
| 域名 | `claude.panle80.cn` |
| 访问地址 | `https://claude.panle80.cn:8443` |
| 部署方式 | Ubuntu 24.04 + systemd + Nginx |

---

## 快速启动

```bash
npm run install:all
cp .env.example .env   # 编辑填入 JWT_SECRET 和 CORS_ORIGIN
npm run dev            # 前端 :5173 + 后端 :3001
```

首次使用需先注册账户。生产部署详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

---

## 功能清单

**核心体验**
- JWT + bcrypt 多用户认证，工作空间隔离
- SSE 流式对话，Markdown + 代码高亮（Prism oneDark）
- `--dangerously-skip-permissions` headless 模式，免交互权限弹窗
- 思考过程折叠、Token 统计、请求中断、超时保护
- 会话管理（新建/切换/重命名/删除确认）
- 亮暗主题（跟随系统偏好）

**技能系统**
- 技能市场 — 管理员上传/管理，用户一键安装
- Claude Code 标准 `SKILL.md` 格式（YAML frontmatter + Markdown）
- CLI 已安装技能自动同步到市场
- 技能点击即用 — 预填 `/<skill-name>` 到输入框
- 文档生成类技能支持：PDF、PPTX、DOCX、XLSX

**文件管理**
- 对话中上传文件附件，自动注入提示词
- 工作空间文件浏览器 — 下载/删除，按大小/日期排序
- 技能输出文件自动归集到 workspace（.pdf/.pptx/.docx/.xlsx/.png/.html 等）
- 中间构建脚本留在 tmp/ 目录，请求间自动清理

**用户体验**
- 响应式设计 — md: 768px 断点，移动端抽屉侧栏
- 错误边界 — 组件崩溃不白屏
- 删除确认 — 防误删
- 复制反馈 — 代码块和消息
- 失败重试 — 出错消息可重试
- 键盘导航 — 会话列表 Tab/Enter/Delete
- 骨架屏 — 加载态灰色脉冲占位
- 无障碍 — 全组件 aria-label/role，44px 最小触摸目标
- 代码分割 — vendor/markdown/syntax 独立 chunk
- PWA 支持 — manifest + Open Graph + safe-area-inset

**安全与运维**
- 双层限流 — Nginx + Express，按路由分组
- 文件级互斥锁 — 并发写入保护（JSONL + titles.json）
- 路径遍历防护 — safeResolve 全量校验
- X-Forwarded-For 防伪造 — 直接覆盖为 $remote_addr
- 响应体上限 — stdout 50MB（支持文档生成），文本 1MB

---

## 更新日志

**2026-05-28 — Phase 7: 技能市场与文档生成**
- 技能市场 — 管理员上传/管理技能，用户一键安装
- 技能文件隔离 — Claude cwd 设为 tmp/，输出文件自动回传 workspace/
- 文档生成依赖：pptxgenjs、pdfkit、pdf-lib、docx、exceljs、mammoth、@resvg/resvg-js
- stdout 上限提升至 50MB（适应 PDF/PPTX 等大文件生成）
- 响应式移动端 — 768px 断点抽屉侧栏，44px 触摸目标，iOS 16px 防缩放
- 对话中上传文件附件，前端自动注入提示词

**2026-05-24 — Phase 6: 安全性加固与并发安全**
- Nginx X-Forwarded-For 修复：直接覆盖为 $remote_addr，防止客户端 IP 伪造绕过限流
- 注册流程重排：先建目录后写密码文件，避免中间失败导致的用户状态不一致
- 新增 fileLock 文件级互斥锁，保护 appendMessages 和 saveTitle 免于并发写入损坏
- 响应体上限：stdout 5MB / 文本 1MB，兼顾复杂工具调用和防失控保护
- titles.json 损坏时日志告警，避免静默丢失
- 前端错误检测改为 isError 标记，替代脆弱的字符串匹配
- 剪贴板 API 加 catch、用户名正则移除泰文字符、死代码清理

**2026-05-22 — Phase 5: 冷启动稳定性**
- chat spawn: `-p` 标志 + prompt 作为 CLI 参数传递（非 stdin），消除 claude Bun 二进制初始化时的时序竞态
- 移除 `script -q -c` PTY 包装器，直接 spawn — PTY 导致 claude 误判交互模式且 `--include-partial-messages` 失效
- systemd ReadWritePaths 加入 `/tmp` `/var/tmp` — Bun 运行时冷启动需要 `/tmp` 可写
- 修复后重启服务首次对话不再出现 content=0chars 零输出

**2026-05-22 — Phase 4: 跨平台清理与测试完善**
- 清理所有 Windows 路径引用
- 删除 npm 自动生成的 .cmd/.ps1 Windows 启动脚本
- 清除 package-lock.json 中 win32/darwin 平台专用依赖
- safeResolve 增强：rel 参数也进行反斜杠规范化
- 2 个跨平台测试重写并启用，总测试 56 个

**2026-05-21 — Phase 1: 安全与稳定性**
- helmet 安全头 + express-rate-limit 双层限流
- ErrorBoundary 组件防白屏
- chat.js finalize() 防双重 res.end() + prompt 100KB 上限
- 消息字段校验 + requestId 日志关联

**2026-05-21 — Phase 2: 用户体验与代码质量**
- useChat 拆分为 useSessions / useMessages / useChat
- 删除确认 / 复制反馈 / 失败重试 / 骨架屏
- SessionList 键盘导航 + 全组件 aria-label
- Vite manualChunks 代码分割

**2026-05-21 — Phase 3: 打磨与测试**
- 后端集成测试：sessions.test.js + chat.test.js
- 客户端组件测试：Login.test.jsx + ChatInput.test.jsx
- PWA manifest + Open Graph + theme-color
- 移除 sync parseJsonl

---

## 更多

- 架构与运维 → [ARCHITECTURE.md](./ARCHITECTURE.md)
- Claude Code 工作指引 → [CLAUDE.md](./CLAUDE.md)
