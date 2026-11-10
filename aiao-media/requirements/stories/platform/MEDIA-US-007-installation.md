---
id: MEDIA-US-007
product: aiao-media
title: 首次访问后台初始化
status: In Review
priority: High
epic: MEDIA-EPIC-001
created: 2026-11-09
updated: 2026-11-09
dependsOn: [MEDIA-US-004, MEDIA-US-006, MEDIA-US-203]
tags: [installation, admin, auth, self-hosted, cloudflare]
---

# 用户故事：首次访问后台初始化

## 作为/我想要/以便

**作为** 站点部署者

**我想要** 安装后首次访问时，在 admin 完成账号服务配置和管理员邮箱、密码设置

**以便** self-hosted 与 Cloudflare 都有统一的首次安装入口

## 范围边界

### In Scope

- 首次导航进入 `/admin/`，直接配置账号服务与管理员账号，无需额外安装凭据。
- self-hosted 自动使用部署配置；Cloudflare 可在向导填写 Supabase URL、公开 Key 和服务端密钥。
- 提供新项目安装 SQL 和已有站点的增量迁移下载；提交前检查账号服务与数据库。
- 创建并确认首个管理员账号；已有账号验证原密码，已有站点仅允许原管理员接入。
- 服务端持久保存安装状态，防重复和并发提权；中途失败保留进度，同服务配置下可修改管理员邮箱继续。
- 完成后关闭初始化写入口，进入管理员登录；用户端在线取得公开配置，离线保留本机能力。

### Out of Scope

- 自动申请 Cloudflare / Supabase 账号、创建云项目、支付订阅或修改数据库管理凭据。
- 浏览器执行任意 SQL、保存管理员密码、重置已有管理员密码或重新开放初始化。
- 生产发布；当前变更交付代码和安装产物，不替代两地真实部署记录。

## 验收标准

| #   | 前置条件                       | 操作                       | 预期结果                                                                             | 状态 |
| --- | ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------ | ---- |
| 1   | 未初始化安装                   | 首次进入用户端或 `/admin/` | 进入独立后台初始化界面                                                               | ✅   |
| 2   | 两种部署形态                   | 提交配置与管理员邮箱、密码 | self-hosted 使用部署配置；Cloudflare 使用填写配置；检查通过后创建并授权管理员        | ✅   |
| 3   | 跨站请求、普通账号             | 初始化或登录后台           | 服务端拒绝，不能自助提权，响应不暴露服务端 Key                                       | ✅   |
| 4   | 并发提交、初始化中断、进程重启 | 修正邮箱、重试或再次初始化 | 同服务配置下可修正邮箱，授权回执丢失仍防止接管，完成后拒绝重复初始化，密码不持久保存 | ✅   |
| 5   | 站点已有管理员                 | 使用其他账号或原管理员接入 | 其他账号被拒，原账号身份和密码保留                                                   | ✅   |
| 6   | 安装已完成或网络离线           | 打开用户端、登录/退出后台  | 公开账号配置即时生效，无需重建；离线本机功能继续可用；退出后会话失效                 | ✅   |

## 技术笔记

本地验证覆盖 Node SQLite、Worker 的持久对象寻址、PGlite 中的真实 PostgreSQL 授权函数和 Angular 界面；上游 Auth 请求使用 fixture，真实两地部署不在本次验收范围内。安装状态保存于单个 Installation Durable Object 或受保护的 `installation.sqlite`；SQL 初始化授权与管理员变更共用数据库事务锁。管理员访问令牌保存在当前标签页的 `sessionStorage`，刷新后可恢复，关闭标签页或过期后重新登录。

国内故障修复另在隔离数据库连接真实 GoTrue v2.189.0 与 PostgREST v14.12，验证重复邮箱、原密码错误、授权前中断、授权成功但响应丢失后的重试、管理员登录、受保护接口、重启保留状态及已有站点接入。对应发布记录见[国内部署记录](../../plans/self-hosted-release-20261109.md)。

验证入口：`aiao-media-api:test`、`aiao-media-api:script-test`、`aiao-media-admin:test`、`aiao-media:production-bundle-test`、`aiao-media:test`、`aiao-media:installation-browser-test`、`aiao-media:deploy-check`。用户端 803 项测试、两套真实浏览器安装/登录/退出流程、发布凭据扫描与 Wrangler dry-run 已通过；浏览器的上游账号服务使用 fixture。

## 实现文件

- [初始化状态机](../../../apps/api/src/installation.ts)
- [初始化与登录界面](../../../apps/admin/src/app/app.ts)
- [数据库授权](../../../infra/supabase/migrations/011-installation.sql)
- [用户端安装配置](../../../apps/web/src/app/installation.ts)

## References

- [部署与首次安装](../../../deploy/installation.md)
