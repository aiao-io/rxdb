---
id: MEDIA-US-006
product: aiao-media
title: 国内自建服务与 IP HTTPS 部署
status: In Review
priority: High
epic: MEDIA-EPIC-001
created: 2026-11-09
updated: 2026-11-09
dependsOn: [MEDIA-US-001]
tags: [deployment, self-hosted, caddy, supabase]
---

# 用户故事：国内自建服务与 IP HTTPS 部署

## 作为/我想要/以便

**作为** 国内部署维护者  
**我想要** 在 aliyun-self 清理旧业务后部署自建 Supabase、产品 API 与 Web，并用 Caddy 提供公网 IP HTTPS  
**以便** 国内安装拥有独立、可复验的账号、同步、原图与代理任务服务

## 范围边界

### In Scope

- 用户已授权清理该服务器旧业务容器、卷和目录；安装真正的 Docker Engine 与 Compose，不操作客户端或海外项目数据。
- Caddy 在公网 IP 的 443 端口提供 Web、产品 API 与 Supabase，验证公开证书信任与续期配置。
- 自建 Auth、PostgREST、Realtime、PostgreSQL、真实 Storage，应用私有原图策略与既有产品迁移。
- Node 运行入口复用既有代理任务状态机；本机 SQLite 持久化任务与闹钟，加密文件保存临时结果，单进程互斥，未知结果不重发。
- 自建 IP Storage 配置、可信续传回执、离线静态产物和受保护的初始账号；秘密不进入网页或报告。
- 容器重启保留数据，记录同主机验证结果与尚未完成的公众生产边界。

### Out of Scope

- 国内外统一身份或图库复制、域名 DNS、生产 SMTP 配置、付费模型调用、账号计费。
- 公众注册和邮件找回：SMTP 未配置前保持关闭，不通过自动确认任意邮箱冒充邮件验证。
- 桌面正式发行、实例升级、站外备份目的地采购与完整生产容量承诺。

## 验收标准

| #   | 前置条件                 | 操作                                                             | 预期结果                                                           | 状态 |
| --- | ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 1   | 旧服务与清理授权明确     | 清理并核对容器、卷、挂载目录及实际容器引擎                       | 旧业务移除，SSH 保持可用，真正的 Engine 与 Compose 可运行          | ✅   |
| 2   | 公网 80/443 可达         | 用正常证书校验访问 IP HTTPS                                      | IP SAN 与地址匹配、信任链通过、HTTP 转 HTTPS、证书自动续期配置存在 | ✅   |
| 3   | 自建服务与产品迁移已部署 | 两个普通账号访问元数据与私有 Storage                             | 本人可读写，跨账号与匿名访问被拒，原图 SHA-256 一致                | ✅   |
| 4   | 国内代理运行时           | 重复接单、错误令牌、容量满、重启恢复和删除后重放                 | 不重复派发，未知不重发，结果只以密文保存，目录只允许一个执行进程   | ✅   |
| 5   | 自建 IP 配置             | 浏览器加载与离线启动、真实 Storage 传输，并注入越界 TUS Location | 访问本部署 Storage，保留原有离线数据，不向越界地址发送凭据         | ✅   |
| 6   | SMTP 未配置              | 使用初始账号登录并尝试公众注册                                   | 初始账号可用、密码私下交付、公众注册明确拒绝，管理 API 仍要求角色  | ✅   |
| 7   | 已保存账号与原图         | 重启应用及基础设施容器                                           | 账号、原图、已接单状态保留；进程丢失的在途请求进入待核对           | ✅   |
| 8   | 同仓海外实现             | 跑类型、lint、任务契约、Web 测试和生产构建                       | 现有 Cloudflare 路径与默认海外配置兼容，生产产物不含服务端秘密     | ✅   |

## 技术笔记

主机为 2 核、约 4 GB 内存、40 GB 磁盘，公网 IP 为 `47.103.117.118`。实施方案见[双部署计划](../../plans/dual-region-deployment.md)。代理任务沿用同步 SQL 状态机，因此使用 Node 内置 SQLite 与文件系统生产适配，减少重写状态机和数据库驱动；业务账号与同步仍用 PostgreSQL。该范围只承诺单 API 实例。

## 实现文件

- [国内 Compose](../../../deploy/self-hosted/compose.yaml)
- [Caddy 配置](../../../deploy/self-hosted/Caddyfile)
- [私有部署准备](../../../scripts/release/prepare-self-hosted.mjs)
- [Node 任务运行时](../../../apps/api/src/node-runtime.ts)
- [Node HTTP 入口](../../../apps/api/src/node-server.ts)
- [原图同步](../../../apps/web/src/local-data/image-sync.ts)

## References

- [需求约定](../../CONVENTIONS.md)
- [代理任务原有合同](../generation/MEDIA-US-109-relay-durable-task.md)

## 验收证据

2026-11-09 [国内发布记录](../../plans/self-hosted-release-20261109.md)记录全部八项范围内验收，故事保持 `In Review` 等待代码评审与合入。真实 Storage 通过公网 IP 完成 PNG/JPEG/TUS 字节校验，浏览器完成登录、四路由和离线重开，整机重启后再次核对数据与任务封存。Node 的真实 SQLite 测试覆盖未知任务恢复与密文边界；未调用付费供应商，不替代 MEDIA-US-109/305 的真实模型与 Web/Tauri 全流程验收。
