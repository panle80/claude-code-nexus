# Changelog

## 2026-05-29

### 安全加固：bwrap 沙箱隔离

- 使用 bwrap（bubblewrap）创建受限 mount namespace，Claude CLI 进程只能访问用户自己的 `tmp/`、`home/`、`workspace/` 目录
- 项目源码（`server/`、`client/`）、其他用户数据、`.env` 等敏感文件在内核级不可见
- 移除 `--bare` 标志以恢复 WebFetch/WebSearch 功能

### 项目迁移：WSL2 → VM

- 项目从 WSL2 Ubuntu 迁移至 VMware Ubuntu Desktop 24.04 LTS
- 更新 CLAUDE.md、ARCHITECTURE.md 中的部署描述

### 配置变更

- 安装 `bubblewrap` 包
- 配置 `kernel.apparmor_restrict_unprivileged_userns=0`（持久化 `/etc/sysctl.d/60-bwrap-userns.conf`）

## 2026-05-28

### 移除管理员功能

- 所有注册用户权限平等
- 技能市场改为只读
- 移除 `requireAdmin` 中间件和 `ADMIN_USERNAMES` 配置

### 初始发布

- React 18 + Vite 5 前端，Express.js 后端
- JWT 认证，SSE 流式响应
- 多用户隔离（每用户独立的 workspace/home/tmp/sessions）
- 技能市场（SKILL.md 格式）
- 响应式设计（md: 768px 断点）
