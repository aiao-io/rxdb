---
id: MEDIA-EPIC-001
status: Done
startDate: 2026-09-26
targetDate: TBD
owner: jimmy
---

# 工作区与静态发布

## 愿景

提供可运行、可验证的 local-first 图片创作应用骨架，通过 Cloudflare 免费静态发布，让创作者无需登录即可用自己配置的供应商生成图片。

## 目标

- [x] Nx / Bun 多项目开发和测试入口（[MEDIA-US-001](../stories/platform/MEDIA-US-001-nx-workspace.md)）
- [x] Cloudflare 静态部署与可选代理、正式域名验证（[MEDIA-US-004](../stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md)）

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [MEDIA-US-001 多项目开发工作区](../stories/platform/MEDIA-US-001-nx-workspace.md) (High)
- [MEDIA-US-004 Cloudflare 边缘代理与安全部署](../stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) (Medium)

## 非目标

- 真实图片/声音/视频生成；见 [epic-002](MEDIA-EPIC-002.md)。
- 服务端渲染、Bun API、PostgreSQL、桌面发行与音视频。

## 进展

MEDIA-US-004 的正式 `https://media.aiao.io`、四路由/WASM/CSP/旧 API 404、allowlist/实际代理、完整离线内容及官方真实 A→B→A 更新/回退已验，最终恢复 B；Workers Free 当前套餐与活动订阅已核对，不代表全账户零账单。全 AC 为 ✅，故事按 D-11 记为 Done，PR 尚未合并，目标按故事状态勾选；证据见[正式交付验收](../plans/public-delivery-verification.md)。
