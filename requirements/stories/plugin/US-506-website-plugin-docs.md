---
id: US-506
title: website 插件文档补齐（history / sync / querycache）
status: In Review
priority: Medium
epic: epic-004-future-features
created: 2026-09-18
updated: 2026-09-18
tags: [plugin, documentation, website]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动 website 文档与生成配置，不依赖其他故事
- [x] Negotiable (可协商): 页面结构细节可调整
- [x] Valuable (有价值): 拆包后接入方查不到手册，只能翻包内 README
- [x] Estimable (可估算): 一天内
- [x] Small (小): 三个手册页 + 导航 + 生成配置
- [x] Testable (可测试): `site-build` 的坏链门禁就是验收
-->

# 用户故事：website 插件文档补齐（history / sync / querycache）

## 作为/我想要/以便

**作为** 升级到 US-025 拆包后版本、要用历史 / 同步 / QueryCache 的接入方
**我想要** 在文档站上按插件查到手册与 API 参考
**以便** 不用翻 GitHub 上的包内 README 才知道装哪个包、API 挂在哪个槽位

## 范围边界

### In Scope

- 三个拆包插件的文档站手册页（`website/docs/plugins/`）
- 侧边栏导航与 typedoc 生成配置收录三个包
- 拆包导致的坏链修复（flatten 脚本 + 源 README 链接形态）
- `undo-redo.md` 补插件依赖提示，与 `branch.md` / `sync.md` 对齐

### Out of Scope

- 阶段 E（树实体外移）的文档——树实体还没拆
- 三插件的框架绑定文档——三个包没有框架绑定层
- `docs/api/` 目录本身入库——它是 gitignore 的生成产物，构建时自动生成

## 验收标准

| #   | 前置条件                                                              | 操作                                                                                                               | 预期结果                                                                                                                                                                                                                                                                      | 状态 |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 无                                                                    | 打开 `website/docs/plugins/rxdb-plugin-history/README.md`                                                          | 手册页存在，内容与 `packages/rxdb-plugin-history/README.md` 对齐，安装段走 `npm2yarn` 块（与 storage 页同惯例）；sync / querycache 两页同                                                                                                                                     | ✅   |
| 2   | 无                                                                    | 查看 `website/sidebars.ts`                                                                                         | 「插件」分类含 `plugins/rxdb-plugin-history/README`、`plugins/rxdb-plugin-sync/README`、`plugins/rxdb-plugin-querycache/README` 三条；「迁移指南」含 `migration/history-sync-plugins`；「数据库适配器」含 `adapters/sqlite-wasm` / `adapters/sqliteai` / `adapters/encrypted` | ✅   |
| 3   | Node 26                                                               | `pnpm nx api-docs website`                                                                                         | `website/typedoc.config.cjs` 的 `entryPoints` 含三个包；`website/docs/api/` 下生成 `rxdb-plugin-history` / `rxdb-plugin-sync` / `rxdb-plugin-querycache` 三目录，`docs/api/README.md` 索引含三行带描述                                                                        | ✅   |
| 4   | AC3 通过                                                              | `pnpm nx site-build website`                                                                                       | 构建通过；`onBrokenLinks` / `onBrokenAnchors` 均为 `throw`，零坏链零坏锚                                                                                                                                                                                                      | ✅   |
| 5   | 首次构建报 `/docs/api/rxdb-plugin-history → ../rxdb-plugin-sync` 坏链 | 修 `packages/rxdb-plugin-history/README.md` 的兄弟包链接形态；修 `rewriteMediaPackageLinks` 保留 `/README.md` 后缀 | 重跑 api-docs 后生成页链接为 `](../rxdb-plugin-sync/README.md)`；`node --test scripts/flatten-api-docs.test.mjs` 8/8                                                                                                                                                          | ✅   |
| 6   | 无                                                                    | 打开 `website/docs/collaboration/undo-redo.md`                                                                     | 顶部有「插件依赖」info：Undo/Redo 由 `@aiao/rxdb-plugin-history` 提供，不装则 `rxdb.versionManager` 不存在                                                                                                                                                                    | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**坏链根因是两层叠加，各修一层：**

1. 源 README 链接形态。`packages/rxdb-plugin-history/README.md` 原来写
   ``[`@aiao/rxdb-plugin-sync`](../rxdb-plugin-sync/)``——裸目录形式被
   typedoc-plugin-markdown 的 media 启发式当成兄弟包目录链接：整包复制进
   `docs/api/_media/` 并把 href 改成 `../_media/<name>`。而 working-tree 等包
   一直写 `](../rxdb-plugin-history/README.md)` 显式文件形式，不会被 media 化。
   已把 history 包改成同一形式。
2. flatten 重写丢后缀。[`rewriteMediaPackageLinks`](../../../website/scripts/flatten-api-docs.mjs)
   把 `](../_media/<name>)` 重写成 `](../<name>)`，剥掉了 `/README.md`。包 README 页的
   站点路由是文件夹索引形态（`/docs/api/<name>`），无后缀链接被 Docusaurus 按路由解析——
   `../<name>` 从 `/docs/api/<name>` 出发落到 `/docs/<name>`，又丢一层。重写目标改回
   `](../<name>/README.md)`：带 `.md` 后缀的链接按源文件路径解析，从包根 README 出发
   恰好指到兄弟包 README。

**`website/docs/api/` 是 gitignore 的生成目录**：`website/scripts/build-website.mjs` 先跑
`pnpm nx api-docs website` 再跑 site-build，CI 上自动重生成，所以本故事只提交源文件与配置，
不提交生成产物。

## 实现文件

- `website/docs/plugins/rxdb-plugin-history/README.md` — 新增手册页（sync / querycache 同）
- `website/sidebars.ts` — 插件分类 ×3、API autogenerated ×3、迁移指南 ×1、适配器分类 ×3
- `website/typedoc.config.cjs` — 三个包加入 `entryPoints`
- `website/scripts/flatten-api-docs.mjs` — 重写保留 `/README.md` 后缀
- `website/scripts/flatten-api-docs.test.mjs` — 重写期望同步更新
- `website/docs/collaboration/undo-redo.md` — 插件依赖提示
- `packages/rxdb-plugin-history/README.md` — 兄弟包链接改显式文件形式

## References

- [US-025 核心包子系统按插件边界外移](../core/US-025-core-plugin-extraction.md)
- [历史与同步拆包](../../../website/docs/migration/history-sync-plugins.md)
- [QueryCache 读引擎拆包](../../../website/docs/migration/querycache-plugin.md)
