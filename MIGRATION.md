# Claude Code Nexus 迁移记录

## 概述

2026-05-28 将项目从 WSL2 Ubuntu 24.04 (10.186.18.231) 迁移至 Windows Server 2016 + VMware Ubuntu Desktop 24.04.4 LTS (10.186.0.201)。

## 环境信息

| 项目 | 值 |
|------|-----|
| 宿主机 | Windows Server 2016 + VMware |
| VM 系统 | Ubuntu 24.04.4 LTS Desktop (GNOME) |
| 虚拟化检测 | vmware |
| CPU | 16 vCPUs |
| 内存 | 8GB (可用 6.7GB) |
| 磁盘 | /dev/sda2 20GB (剩余约 4.4GB) |
| 内网 IP | 10.186.0.201/24 |
| 桥接网络 | 是，外部可直接访问 |
| Node.js | v24.15.0 |
| npm | 11.15.0 |
| Nginx | 1.24.0 |
| Claude CLI | /usr/bin/claude v2.1.153 |
| 中文字体 | Noto Sans/Serif CJK, AR PL UKai, cwTeX FangSong (apt 安装) |

## 部署路径

```
/home/panle/web/               # 项目根目录
├── .env                       # 环境变量 (API Token, JWT Secret 等)
├── client/dist/               # 前端构建产物 (Nginx 托管)
├── server/                    # Express 后端
├── data/users/                # 用户数据
└── logs/                      # 运行日志
```

## 关键配置文件

### .env 关键项
```
CLAUDE_PATH=/usr/bin/claude
USER_DATA_ROOT=/home/panle/web/data/users
JWT_SECRET=<从旧服务器迁移>
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=<从旧服务器迁移>
ANTHROPIC_MODEL=deepseek-v4-pro[1m]
ADMIN_USERNAMES=panle80
```

### Nginx 配置
- 文件：`/etc/nginx/sites-enabled/claude-code-nexus`
- 端口：8443 SSL (TLSv1.2/1.3)
- 证书：`/etc/nginx/ssl/claude.panle80.cn_bundle.crt` + `.key`
- 证书来源：TrustAsia DV (2026-05-18 ~ 2026-08-15)
- 静态文件：`/home/panle/web/client/dist/`
- API 代理：`/api/*` → `http://[::1]:3001`
- 注意：嵌套 location (`/api/auth/`, `/api/chat`) 需要各自声明 `proxy_pass`，nginx 不会继承该指令

### systemd 服务
- 文件：`/etc/systemd/system/claude-code-nexus.service`
- 用户：panle
- 内存限制：500M
- ProtectSystem：strict
- ReadWritePaths：/home/panle/web/data, /home/panle/web/logs, /tmp, /var/tmp

## 服务管理

```bash
# 查看服务状态
sudo systemctl status claude-code-nexus nginx

# 重启服务
sudo systemctl restart claude-code-nexus
sudo systemctl restart nginx

# 查看日志
journalctl -u claude-code-nexus -f
sudo tail -f /var/log/nginx/claude-error.log

# 测试连通性
curl http://localhost:3001/api/health
curl -sk https://localhost:8443/api/health
```

## 网络架构

```
外网 → 企业 NAT (38.92.27.105) → 路由器端口转发 8443 
  → Windows Server 2016 防火墙 (需确保 8443 入站放行)
    → VMware 桥接网络
      → Ubuntu VM (10.186.0.201:8443 Nginx SSL)
        → [::1]:3001 Express
          → Claude CLI (cwd: tmp/ HOME: home/)
```

## 迁移过程中发现和修复的问题

### 1. nginx 嵌套 location 不继承 proxy_pass
- **现象**：/api/health 正常，/api/auth/* 和 /api/chat 返回 404
- **原因**：项目 nginx-site.conf 中嵌套 location 只声明了 limit_req，未声明 proxy_pass。nginx 不跨嵌套 location 继承 proxy_pass 指令
- **修复**：在 `/api/auth/` 和 `/api/chat` 各自添加 `proxy_pass http://[::1]:3001;`
- **已同步**：项目仓库 nginx-site.conf (/home/panle/web/nginx-site.conf) 已更新

### 2. nginx 无法访问静态文件
- **现象**：前端首页返回 500，错误日志显示 Permission denied
- **原因**：nginx worker 进程以 www-data 运行，而 /home/panle/ 目录权限为 750 (drwxr-x---)，others 不可遍历
- **修复**：`chmod o+x /home/panle/` 允许遍历

### 3. npm install 目录问题
- **现象**：多次在错误目录安装依赖
- **原因**：SSH 默认工作目录为 /home/panle，非 /home/panle/web
- **解决**：使用 `npm --prefix /home/panle/web install` 指定目录

### 4. 磁盘空间紧张
- **初始**：6.1GB 剩余 (68%)
- **部署后**：4.4GB 剩余 (77%)
- **警告**：后续文档生成类操作可能消耗大量磁盘，需定期清理

## SSH 免密登录

已配置 Ed25519 密钥对，从 WSL2 可直接免密登录：
```bash
ssh panle@10.186.0.201
```
密钥位置：`~/.ssh/id_ed25519`

## 迁移时间线

- 12:36 磁盘清理、目录创建、默认 nginx 禁用
- 12:37 SSL 证书传输
- 12:38 代码克隆、.env 配置
- 12:49 依赖安装完成
- 12:50 前端构建完成、用户数据开始传输
- 13:08 用户数据 (248MB/450MB) 提取完成
- 13:09 Nginx 配置部署、systemd 服务启动
- 13:10-13:15 权限修复、nginx 配置修正、验证完成

## 待处理

- [x] 企业路由器端口映射：10.186.18.231:8443 → 10.186.0.201:8443
- [x] Windows Server 2016 防火墙确认 8443 入站规则（外部已可访问）
- [x] 域名 claude.panle80.cn 切换后验证
- [x] 旧 WSL2 服务下线
- [ ] SSL 证书将于 2026-08-15 到期，届时需续期
