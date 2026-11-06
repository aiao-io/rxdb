---
id: BOM-US-002
title: Cloudflare 静态发布与公网验收
status: In Review
priority: High
epic: BOM-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [bom, platform, deployment]
dependsOn: [BOM-US-001]
capabilities: []
---

# 用户故事：Cloudflare 静态发布与公网验收

## 作为/我想要/以便

作为使用者，我想通过 HTTPS 打开 BOM 工作台并保留本机数据，以便不依赖开发服务器完成生产改版核对。

## 范围边界

### In Scope

Cloudflare Workers Static Assets、生产产物发布、SPA 深链接、SQLite/WASM 浏览器隔离、本地部署仿真与公网 Chromium 验收。

### Out of Scope

自定义域名、账号与多人同步、跨 origin 自动迁移、历史 schema 升级、全站离线缓存及其他浏览器的正式发行承诺。

## 验收标准

| #   | 前置条件                       | 操作                             | 预期结果                                                                           | 状态 |
| --- | ------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| 1   | 已登录目标 Cloudflare 账号     | 运行应用 deploy 目标             | 从生产 browser 目录发布，无需手工选择产物，得到实际 HTTPS 地址                     | ✅   |
| 2   | 生产产物在 Cloudflare 提供服务 | 直接访问所有页面入口并刷新核对页 | 深链接返回应用，COOP/COEP 响应头完整，浏览器处于 crossOriginIsolated               | ✅   |
| 3   | 新浏览器工作区首次打开部署地址 | 加载样本、刷新并执行改版计算     | WASM 返回可编译二进制及正确 MIME；同一 origin 的本地数据重开后可用                 | ✅   |
| 4   | 维护者需要复验部署             | 执行本地仿真与公网部署测试       | 相同验收用例适用于两环境；凭据留在环境或 Wrangler 登录记录，明确跨 origin 数据边界 | ✅   |

## 实现文件

- [Wrangler 配置](../../../wrangler.json)
- [响应头](../../../public/_headers)
- [Nx 发布目标](../../../project.json)
- [部署浏览器配置](../../../../aiao-bom-e2e/playwright.cloudflare.config.ts)
- [部署验收用例](../../../../aiao-bom-e2e/cloudflare/deployment.spec.ts)

## 验收证据

已实际发布至 `https://aiao-bom.aiao.workers.dev`，Worker 版本 `90bd7049-23cb-49e8-bd57-c252fc8bc211`。本地 Wrangler 与真实公网 Chromium 部署验收均为 4/4，通过深链接、隔离响应头、WASM、同源持久化和改版计算。

证据符号包括 `BOM-US-002 所有入口与深链接返回应用及隔离响应头`、`BOM-US-002 SQLite WASM 返回可编译二进制及正确 MIME`、`BOM-US-002 相同部署 origin 重开保留本地样本并完成改版计算`。完整命令、产物核对和环境边界见[Cloudflare 验收记录](../../plans/cloudflare-deployment-verification.md)。保留 In Review，等待 PR 评审和合并。

## References

- [应用决策](../../decisions.md)
- [分层验收台账](../../verification-report.md)
