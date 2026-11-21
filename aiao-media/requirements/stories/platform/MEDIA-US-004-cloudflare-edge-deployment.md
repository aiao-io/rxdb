---
id: MEDIA-US-004
legacyId: aiao-media:US-004
product: aiao-media
title: Cloudflare 静态部署与平台生成入口
status: Done
priority: Medium
epic: MEDIA-EPIC-001
created: 2026-09-27
updated: 2026-11-13
dependsOn: []
tags: [cloudflare, deployment, static, relay]
---

# 用户故事：Cloudflare 静态部署与平台生成入口

## 作为/我想要/以便

**作为** 图片创作者  
**我想要** 通过稳定的 HTTPS 域名加载 local-first 应用，并通过同源任务接口生成图片  
**以便** 本地优先应用可靠出图

## 范围边界

### In Scope

- Cloudflare Workers Static Assets 发布 CSR 应用；本机模式无业务后端前置。可选账号/复制依赖 Supabase，同 Worker 提供受保护的管理 API 与公开模板/策略读取。
- 同源平台生成入口：任务接口与受保护的管理 API、公开模板/策略读取；按请求 Key 的无状态代理已按 [D-19](../../decisions.md#d-19登录用户经平台积分生图移除用户自配供应商) 移除，上游调用使用平台凭据。
- 四路由 SPA fallback、指纹静态资源、CSP/离线壳与版本化 Service Worker；发布回退不删除本地数据。
- 正式域名 `media.aiao.io` 验证、免费计划账单与实际发布地址记录。

### Out of Scope

- SSR、Bun API、PostgreSQL、Cloudflare Queues / D1 / R2。
- 图片文件长期云存储；平台生图任务的具体契约见 [MEDIA-US-108](../generation/MEDIA-US-108-platform-generation.md) / [MEDIA-US-109](../generation/MEDIA-US-109-relay-durable-task.md)。

## 验收标准

| #   | 前置条件               | 操作                            | 预期结果                                                     | 状态 |
| --- | ---------------------- | ------------------------------- | ------------------------------------------------------------ | ---- |
| 1   | 已授权 Cloudflare 账号 | `pnpm nx run aiao-media:deploy` | 返回真实 URL/version ID；四路由、WASM、CSP 与旧 API 404 可验 | ✅   |
| 2   | 允许列表已配置         | 通过任务接口生成请求            | 只允许白名单前缀、同源 POST、固定路径；外部站点不访问本站    | ✅   |
| 3   | 已发布正式域名         | 断网冷启动与刷新                | 离线壳接管，配置/草稿/作品可读；不缓存 Key/生成响应          | ✅   |
| 4   | 更新发布               | 版本回退                        | 回退不删除本地数据；不兼容 schema 阻止旧代码写入             | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 技术笔记

当前发布为 Workers Static Assets + 同 Worker 平台任务接口，正式地址 `https://media.aiao.io`，version `cc8cc646-560e-4d36-b0cb-2e311a2d0e25`。四路由、WASM、CSP、旧 API 404 与 46 项离线资源完整性已验；真实供应商代理三画幅交付与正式 origin 的离线新文档启动已通过（该证据为 D-19 前的历史能力）。控制台确认 Workers Free 为当前活动计划，不代表账户其它产品或第三方模型免费。发布身份、原图摘要及历史直连限制见[正式交付验收](../../plans/public-delivery-verification.md)。按 [D-19](../../decisions.md#d-19登录用户经平台积分生图移除用户自配供应商)，按请求 Key 的无状态 `/api/relay` 由平台生图任务接口取代（见 [MEDIA-US-108](../generation/MEDIA-US-108-platform-generation.md) / [MEDIA-US-109](../generation/MEDIA-US-109-relay-durable-task.md)）；本故事的静态部署范围不变。

2026-10-25 正式真实产物套件已完成官方发布 A→官方回退 B→官方回退 A；每次新 worker waiting 时旧 DOM 不变，关闭旧页、等待 activated 后核对新入口。每阶段真断网四路由由 Service Worker 响应，相同 profile/schema `1`、测试供应商全部配置及空 Key、草稿和通过产品备份导入的合法 fixture PNG 精确下载均保持，0 生成。最终另行官方回退恢复 B，当时 deployment `aac93845-7add-4fd3-b45a-d37dfc5d1319`，API 核对 100% B 流量、manifest 和账号配置 `null`。该 PNG 非供应商生成图。AC2 结合实际 allowlist 1 项/代理三画幅和已有运行时目标、同源、路径边界测试通过；全部 AC 为 ✅，2026-10-25 按用户本次指令及 D-11 记为 `Done`，PR 评审与合并单独跟踪。详细身份与CLI前置条件见[正式交付验收](../../plans/public-delivery-verification.md)。

2026-10-25 20:25 另行发布正式 C，官方 100% 流量、四路由/CSP、46/46 离线资源和真断网新文档烟测通过，生成 0 次；本次未重跑 B/C 更新回退。回执与边界见[供应商补验记录](../../plans/provider-acceptance-follow-up.md#正式发布-c-与公网烟测)。

当前代码已加入按工作区 schema marker 的打开/操作守卫，真实浏览器验证不兼容版本阻止已有标签页写入并保留原数据；见[可靠性验收](../../plans/local-reliability-verification.md)。该检查不能保护不认识 marker 的旧产物，不把这些产物作为回退目标。正式 A/B 同 schema 更新/回退已验；更高 marker 拒写仅引用已验本地守卫，本次未在线注入更高 marker 或执行真实 schema 转换。

2026-10-25 按用户本次结项指令，全部 AC 已验的本故事记为 Done；PR #154 仍未合并。状态口径见 [D-11](../../decisions.md)，原有验收与部署边界保留。

## 实现文件

- [`apps/api/wrangler.json`](../../../apps/api/wrangler.json) — Worker 配置。
- [`apps/api/src/local-first-worker.ts`](../../../apps/api/src/local-first-worker.ts) — `/api/relay` 无状态代理。
- [`deploy/local-first-pages.md`](../../../deploy/cloudflare/local-first-pages.md) — 静态部署方案与免费额度边界。
- [`scripts/deploy-local-first.mjs`](../../../scripts/release/deploy-local-first.mjs) / [`scripts/check-local-first-release.mjs`](../../../scripts/release/check-local-first-release.mjs) — 发布与产物审查。
- [`scripts/build-offline-assets.mjs`](../../../apps/web/scripts/build-offline-assets.mjs) — 离线壳与 Service Worker。

## References

- [项目需求约定](../../CONVENTIONS.md)
- [MEDIA-US-102 统一图片生成](../generation/MEDIA-US-102-image-generation.md)
