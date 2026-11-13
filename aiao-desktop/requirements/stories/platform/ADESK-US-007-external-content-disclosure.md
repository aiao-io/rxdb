---
id: ADESK-US-007
title: 外网内容来源与隐私说明
status: Backlog
priority: High
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-13
tags: [platform, privacy, external-content]
dependsOn: []
capabilities: []
---

# 用户故事：外网内容来源与隐私说明

## 作为/我想要/以便

**作为** 使用线上 Aiao Desktop 的人
**我想要** 知道桌面会向哪些第三方发送什么、为什么发送
**以便** 在输入网址、搜索地名或打开壁纸之前，就清楚这些内容来自哪里、哪些信息会离开我的浏览器。

## 范围边界

### In Scope

- **外网依赖清单**：[D-04](../../decisions.md#d-04外网内容可缺失) 列出的每一项都写明第三方主机、用途、会发送的数据和触发方式（打开应用就请求，还是用户操作后才请求）。所有请求至少让第三方看到用户的 IP；Safari 阅读模式会把用户输入的网址发给 `r.jina.ai`，地名搜索会把搜索词发给 Nominatim，这两处要点名。
- **桌面里能找到说明**：从桌面内的入口（建议放在「关于本机」）打开一页说明，列出上面的清单；Safari 阅读模式的入口处有一行提示，说明网址会发给第三方。
- **清单随代码走**：外网主机登记在代码里的一份清单中，说明页由它渲染；D-04 交付后指向这份清单，不再另写一份主机列表。web 源码里出现的外网主机必须在清单里，或在「只是链接、不发请求」的名单里，否则单测失败。

### Out of Scope

- 外网内容本地化与无网占位：仍是[候选方向](../../future-requirements.md)；本故事只说明现状，不改变请求方式。
- 同意弹窗、按来源关闭外网请求、用户可配置的代理。
- 法务条款的审定：本故事写事实，不写条款。
- 服务端日志与分析：产品没有服务端（[D-03](../../decisions.md#d-03只有前端不带任何密钥)）。

## 验收标准

| #   | 前置条件         | 操作                           | 预期结果                                                                                       | 状态 |
| --- | ---------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- | ---- |
| 1   | 正式构建         | 从桌面里的入口打开外网内容说明 | 页面列出 D-04 的每一项外网依赖：第三方主机、用途、会发送的数据、触发方式                       | ⬜   |
| 2   | 打开 Safari      | 查看阅读模式的入口             | 入口处有提示：输入的网址会发给 `r.jina.ai`                                                     | ⬜   |
| 3   | 当前源码         | 运行 web 单测                  | 源码里出现的每个外网主机都在清单里登记，或在「只是链接」名单里；新增一个未登记的主机时单测失败 | ⬜   |
| 4   | 外网请求全部拦截 | 冒烟里打开说明页               | 页面可达、没有页面错误（说明页不依赖外网）                                                     | ⬜   |
| 5   | 清单交付后       | 对照 D-04 与说明页             | D-04 指向清单文件，没有第二份主机列表                                                          | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1、#2、#4 由 `aiao-desktop-e2e:e2e` 的检查组覆盖（拆分后的位置见 [ADESK-US-008](ADESK-US-008-smoke-suite.md)）；#3 是 web 单测（`aiao-desktop-web:test`）；#5 是文档检查，需求门禁校验 D-04 里指向清单的链接有效。

## 技术笔记

- 现状清单来自对源码的检索，实现时以检索结果为准：`images.unsplash.com`（壁纸）、`upload.wikimedia.org` 与 `commons.wikimedia.org`（照片）、`basemaps.cartocdn.com`（地图瓦片）、`nominatim.openstreetmap.org`（地名搜索）、`api.open-meteo.com`（天气）、`r.jina.ai`（Safari 阅读模式）、`icons.duckduckgo.com`（网站图标）、`fonts.googleapis.com` 与 `fonts.gstatic.com`（网页字体）、`www.youtube.com`（Safari 里的视频嵌入）。种子内容里还有一些网址（维基百科、MDN、Apple 等），是否发请求取决于 Safari 里的操作，实现时逐个确认归入「清单」还是「只是链接」。
- 站点已公开托管（[ADESK-US-003](ADESK-US-003-cloudflare-pages-deploy.md)），所以本故事不等绑定自定义域名（[ADESK-US-004](ADESK-US-004-custom-domain.md)）。
- 说明页只描述，不改变请求；外网内容拿不到时页面照常（D-04）。

## 实现文件

- `aiao-desktop/apps/web/src/app/shared/external-content.ts`（新增）— 外网主机清单：主机、用途、会发送的数据、触发方式。
- `aiao-desktop/apps/web/src/app/apps/about/` — 说明页入口（建议放在「关于本机」）。
- `aiao-desktop/apps/web/src/app/apps/safari/` — 阅读模式入口处的提示。
- `aiao-desktop/requirements/decisions.md` — D-04 改为指向清单。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 说明页检查组。

## References

- [ADESK-EPIC-001](../../epics/ADESK-EPIC-001.md)
- [D-04 外网内容可缺失](../../decisions.md#d-04外网内容可缺失)
- [ADESK-US-003 一键发布到 Cloudflare Pages](ADESK-US-003-cloudflare-pages-deploy.md)
- [ADESK-US-004 绑定自定义域名与同站托管](ADESK-US-004-custom-domain.md)
