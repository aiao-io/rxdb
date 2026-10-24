---
id: MEDIA-US-004
legacyId: aiao-media:US-004
product: aiao-media
title: Cloudflare 静态部署与可选代理
status: In Progress
priority: Medium
epic: MEDIA-EPIC-001
created: 2026-09-27
updated: 2026-10-24
dependsOn: []
tags: [cloudflare, deployment, static, relay]
---

# 用户故事：Cloudflare 静态部署与可选代理

## 作为/我想要/以便

**作为** 图片创作者  
**我想要** 通过稳定的 HTTPS 域名加载 local-first 应用，并在需要时走同源代理调用供应商  
**以便** 无需本站后端也能可靠出图

## 范围边界

### In Scope

- Cloudflare Workers Static Assets 发布 CSR 应用；本机模式无业务后端前置。可选账号/复制依赖 Supabase，同 Worker 提供受保护的管理 API 与公开模板/策略读取。
- 同源 `/api/relay` 无状态代理：精确允许列表、固定上游路径、按请求 Key、无缓存/日志、超时/流式限制。
- 四路由 SPA fallback、指纹静态资源、CSP/离线壳与版本化 Service Worker；发布回退不删除本地数据。
- 正式域名 `media.aiao.io` 验证、免费计划账单与实际发布地址记录。

### Out of Scope

- SSR、Bun API、PostgreSQL、Cloudflare Queues / D1 / R2。
- 图片文件长期云存储；供应商直连/代理的具体调用协议见 MEDIA-US-105 / MEDIA-US-102。

## 验收标准

| #   | 前置条件               | 操作                            | 预期结果                                                     | 状态 |
| --- | ---------------------- | ------------------------------- | ------------------------------------------------------------ | ---- |
| 1   | 已授权 Cloudflare 账号 | `pnpm nx run aiao-media:deploy` | 返回真实 URL/version ID；四路由、WASM、CSP 与旧 API 404 可验 | ⚠️   |
| 2   | 允许列表已配置         | 直连/代理模式分别请求           | 直连不访问本站；代理只允许白名单前缀、同源 POST、固定路径    | ⚠️   |
| 3   | 已发布正式域名         | 断网冷启动与刷新                | 离线壳接管，配置/草稿/作品可读；不缓存 Key/生成响应          | ⚠️   |
| 4   | 更新发布               | 版本回退                        | 回退不删除本地数据；不兼容 schema 阻止旧代码写入             | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 技术笔记

当前发布为 Workers Static Assets + 同 Worker `/api/relay`，地址 `https://aiao-media.aiao.workers.dev`（version `92883918-76ac-47de-a424-4bc5af23bee9`）。四路由、WASM、旧 API 404 与公网烟测已验；正式目标域名已确定为 `media.aiao.io` 并写入 Wrangler 自定义域名配置；域名绑定、正式 origin 的供应商 CORS 与免费计划账单仍待验。

当前本地代码已加入按工作区 schema marker 的打开/操作守卫，真实浏览器验证不兼容版本阻止已有标签页写入并保留原数据；见[可靠性验收](../../plans/local-reliability-verification.md)。该检查不能保护不认识 marker 的旧产物，不把这些产物作为回退目标；正式更新与版本回退仍待验。

## 实现文件

- [`deploy/wrangler.json`](../../../deploy/wrangler.json) — Worker 配置。
- [`deploy/local-first-worker.mjs`](../../../deploy/local-first-worker.mjs) — `/api/relay` 无状态代理。
- [`deploy/local-first-pages.md`](../../../deploy/local-first-pages.md) — 静态部署方案与免费额度边界。
- [`scripts/deploy-local-first.mjs`](../../../scripts/deploy-local-first.mjs) / [`scripts/check-local-first-release.mjs`](../../../scripts/check-local-first-release.mjs) — 发布与产物审查。
- [`scripts/build-offline-assets.mjs`](../../../scripts/build-offline-assets.mjs) — 离线壳与 Service Worker。

## References

- [项目需求约定](../../CONVENTIONS.md)
- [MEDIA-US-102 统一图片生成](../generation/MEDIA-US-102-image-generation.md)
