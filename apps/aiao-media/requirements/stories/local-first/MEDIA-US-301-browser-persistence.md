---
id: MEDIA-US-301
legacyId: aiao-media:US-301
product: aiao-media
title: 浏览器本地草稿与图片持久化
status: In Review
priority: High
epic: MEDIA-EPIC-004
created: 2026-09-26
updated: 2026-10-24
dependsOn: []
capabilities:
  - ref: rxdb:US-502
    integration: verified
    evidence: requirements/plans/rxdb-import-verification.md
tags: [rxdb, web, offline, image, opfs, backup]
---

# 用户故事：浏览器本地草稿与图片持久化

## 作为/我想要/以便

**作为** Web 创作者

**我想要** 无需登录即可在本机保存配置、草稿、任务和图片，并可导出备份

**以便** 刷新、重开或断网后继续使用自己的内容

## 范围边界

### In Scope

- 首次启动建立随机 UUID 本机工作区，后续启动复用固定 bootstrap 记录 `aiao-local-profile-v1`，不把本机 ID 冒充服务器用户。基本功能不依赖本站业务 API、数据库、账号或 Supabase。
- 应用数据使用本仓 `@aiao/rxdb` 与 wa-sqlite/IndexedDB，图片文件通过 `@aiao/rxdb-plugin-storage` 落 OPFS；WASM 随应用同源发布。依赖为 0.0.28 工作区包，由 Nx 构建前置准备，不使用跨仓源码软链或本地绝对路径。
- 供应商非敏感配置、独立凭据、结构化草稿、任务记录与作品分别管理；记录保留稳定 ID、schema/revision 和时间信息。当前本机实体使用 `SyncType.None`，可同步 DTO 使用独立数据库与原生 Supabase adapter/plugin，详见 MEDIA-US-302。
- Tiptap 草稿保存正文、字段定义/值、模板 ID/版本与画幅；300 ms 防抖，显示未保存/保存中/已保存/冲突/失败。自己的保存回执不覆盖当前编辑器；跨标签使用 revision CAS，未保存输入冲突时让用户选择采用最新或保留当前，不无限重试覆盖。
- 文件写入与关联回读成功后才声明本地已保存。OPFS 不可用、权限错误、容量不足或数据损坏均有明确状态，不静默降级到内存；写入/删除 journal 支持可识别中断恢复。
- 首次联网完成离线资源准备后，四路由 `/`、`/create`、`/images`、`/providers` 可离线冷启动，已有草稿、配置与图片可读。Service Worker 只缓存版本化应用资源，不缓存 Key、生成请求或响应；离线生成明确提示需要联网。
- 供应商页展示存储配额、支持时申请持久存储，提供包含草稿、非敏感配置、最近 100 条任务及真实原图的 JSON 备份；固定排除 API Key，单文件上限 64 MiB。
- 导入先验证格式、版本、大小、图片摘要/尺寸/解码，再写独立暂存工作区；全部成功才切换，失败不覆盖原数据，同份备份中断后可继续。原工作区 ID 记为 `aiao-local-previous-profile-v1`，不静默合并或清除旧账号命名空间。
- 浏览器数据按 origin 隔离；换域名、浏览器或设备通过下载/导出导入迁移。清除浏览器站点数据会删除本机工作区，页面说明边界；发布回退不得删除数据，不兼容 schema 应阻止旧代码写入。

### Out of Scope

- 离线调用远程模型、浏览器存储永久不丢失保证与云备份。
- 登录解锁或离线服务器授权作为本机启动前提；账号绑定与多机同步另见 MEDIA-US-201/MEDIA-US-302。
- 自动清理或合并全部历史账号库、恢复旧后端中从未下载到本机的文件。
- 移动设备存储、系统输入法与下载的真机验收。

## 验收标准

| #   | 前置条件                                  | 操作                         | 预期结果                                                     | 状态 |
| --- | ----------------------------------------- | ---------------------------- | ------------------------------------------------------------ | ---- |
| 1   | 干净浏览器，无账号/业务后端               | 保存配置和草稿后刷新         | 复用固定本机工作区，配置与输入可恢复，不访问旧认证 API       | ✅   |
| 2   | 持久存储可用                              | 保存图片后离线打开           | OPFS 原图可预览和下载，不使用远程 URL 代替                   | ✅   |
| 3   | 首次在线完成离线资源安装                  | 断网冷启动四路由             | 应用及本机内容可用，生成明确要求联网                         | ✅   |
| 4   | 两标签页编辑或同时生成                    | 保存与提交                   | 草稿冲突保留输入并明确选择，生成互斥                         | ✅   |
| 5   | OPFS 失败                                 | 生成并保存图片，随后恢复重试 | 不显示已保存，不退化为内存持久化，不再次生成                 | ✅   |
| 6   | 已有作品、草稿及 Key                      | 导出并导入备份               | 原图/草稿可离线回读，文件不含 Key，独立工作区恢复            | ✅   |
| 7   | 损坏、超限或中断的备份                    | 尝试导入并重试               | 失败不切换或清除原库，暂存恢复可继续，重复 ID 不覆盖原工作区 | ✅   |
| 8   | 已验 0.0.26 基线或未知/更高 schema marker | 启动、升级或兼容构建回退     | 保留工作区/原图；拒绝不兼容访问，不降级数据库                | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 技术笔记

无登录工作区、本机草稿、离线壳和备份已交付。`aiao-media-e2e:local-first-e2e` 使用真实 Chrome、RxDB、WASM、IndexedDB、OPFS 与 Service Worker；`aiao-media:test` 和 `aiao-media:test-browser` 覆盖草稿 codec/CAS 与文件状态机。模拟供应商不消耗模型额度，也不证明正式 origin 的真实生成。并发 CAS、备份超限/损坏/重复 ID 与中断续导已验；当前版本的 schema marker 在打开与每次操作前阻止不兼容访问。详见[可靠性验收](../../plans/local-reliability-verification.md)。D-07 仅承诺已验的 0.0.26 基线升级、旧引擎拒绝降级后恢复新版，以及当前 schema marker 守卫；未验证历史库不承诺自动迁移，未知/更高 marker 拒绝访问并保留原数据。缺少 marker 时按当前 v1 初始化，不能据此识别所有未知旧库。正式 origin 发布回退继续由 MEDIA-US-004 AC4 验收，完整分层见[验收记录](../../verification-report.md)。

草稿自动保存的状态与并发约束见[本机草稿说明](local-first-studio.md)。配额提示与持久存储申请不能保证浏览器永久保留数据；重要图片应下载并定期备份。

## 实现文件

- [本地工作区与文件存储](../../../src/local-data/browser-media.ts)
- [草稿结构与校验](../../../src/local-data/studio-draft.ts)
- [草稿会话与冲突处理](../../../src/app/prompts/studio-draft-session.ts)
- [本机启动、设置与隔离导入](../../../src/app/local-image-mvp.ts)
- [备份编解码与校验](../../../src/app/local-backup.ts)
- [离线资源构建](../../../scripts/build-offline-assets.mjs)与[Service Worker](../../../scripts/offline-worker.js)
- [真实应用浏览器测试](../../../../aiao-media-e2e/src/local-first.spec.ts)

## References

- [MEDIA-US-202 本地图片作品与任务历史](../account/MEDIA-US-202-library.md)
- [MEDIA-US-302 多端草稿同步与冲突处理](MEDIA-US-302-draft-sync.md)
- [真实应用集成验证](../../plans/local-first-app-verification.md)
- [静态部署与回退](../../../deploy/local-first-pages.md)
