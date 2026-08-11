# `website` 文档 vs 实现 评审（2026-08-07）

## 结论

总体方向正确，文档站维护良好且与代码同步推进。但有 **2 个 API 不存在引用**、**1 个 typedoc 示例失配**、**1 个三框架不对称**、**2 个跨包导航缺口** 与数处文案/链接待强化。**不阻塞发布**，但 P0/P1 项目在下次内容同步窗口必须收口。

## 评审基线

- 基线日期：2026-08-07
- 范围：`website/` 文档、`website/src/` 页面与组件、各 `packages/*` 公开 API 表面对照
- 已读：`website/docs/`、`website/src/pages/{index,architecture,comparison,benchmarks,demos/*}.tsx`、`website/sidebars.ts`、`website/docusaurus.config.ts`、`packages/rxdb-{react,vue,angular}/src/{index,hooks,rxdb-*,rxdb.provider}.{ts,tsx}`、`packages/rxdb-plugin-search{,-angular,-react,-vue}/src/index.ts` 与 README
- 自动校验：本轮仅做静态只读比对，未跑 `typedoc` 重生成或文档构建

## 发现清单

| 类别       | 级别  | 位置                                                                               | 问题与影响                                                                                                                                                                                                                                                                                   | 建议                                                                                                                                    |
| ---------- | ----- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| API 不存在 | 🔴 P0 | `docs/frameworks/angular.md:38-54`                                                 | 文档示例 `private rxdbService = inject(RxDBService)` 引用了**仓库中不存在的 `RxDBService`**。`packages/rxdb-angular/src/index.ts` 仅导出 `provideRxDB`、hooks、`RxDBEntityChangeDirective`、directive、action/infiniteScroll/state。调用方按文档写代码编译即报错，错误指向正确方向但路径不对 | 整段 `RxDBService` 小节删除；改为「`provideRxDB(() => rxdb)` 后用 `inject(RxDB)` 直接取实例，或在构造器内调 `useFind/useGet` 拿资源」   |
| API 不存在 | 🔴 P0 | `docs/plugins/rxdb-plugin-search/README.md:48-56`、`docs/devtools/README.md:30-44` | 文档使用 `createRxDatabase({ adapter, plugins: [...] })`，但仓库**没有 `createRxDatabase` 函数**。全仓仅 `rxdb-plugin-search/src/plugin.ts:496`（docstring 示例）与 `adapter-guard.ts:4`（错误文案）出现该名字                                                                               | 全部改为 `new RxDB({...}).use(rxDBPluginSearch, opts)`；同步更新 devtools README 中 RxDBDevtools 接入示例                               |
| API 不一致 | 🟡 P1 | `docs/plugins/rxdb-plugin-search/README.md:74`                                     | 文档示例 `import { injectSearch } from '@aiao/rxdb-plugin-search-angular'` 与代码不一致——`packages/rxdb-plugin-search-angular/src/index.ts` 主导出已统一为 `useSearch`，`injectSearch` 是 `@deprecated` 别名（`inject-search.ts:35-36` 注释明确）                                            | 示例统一为 `useSearch(this.db)`；在 `docs/migration/plugins.md` 增一条 `injectSearch → useSearch` 迁移说明                              |
| API 失配   | 🟢 P2 | `docs/api/rxdb-angular/functions/useGet.md:33`、`docs/api/rxdb-vue/README.md:66`   | typedoc 生成的 API 文档示例 `useGet(User, 'user-1')` 传入**裸字符串 ID**，但三端 `useGet` 第二参数类型均为 `EntityStaticType<T, 'getOptions'>`（完整 `get` 选项对象），没有字符串重载；用户复制示例代码编译报错                                                                              | 在 hook 层增加字符串重载并补齐测试；或 typedoc 配置中更正示例为 `useGet(User, { id: 'user-1' })`                                        |
| 对称性     | 🟡 P1 | `docs/frameworks/{react,vue,angular}.md`                                           | 三端都有 `useInfiniteScroll`（`packages/rxdb-react/src/useInfiniteScroll.ts`、`rxdb-angular/src/useInfiniteScroll.ts`、`rxdb-vue/src/useInfiniteScroll.ts`），README 都有用法，但**文档站没有独立章节**                                                                                      | 在三端 `frameworks/*.md` 末尾补 `### 无限滚动` 小节，引用 README 中的 `useInfiniteScroll` 示例                                          |
| 对称性     | 🟡 P1 | `docs/frameworks/angular.md`（与 React/Vue 对比）                                  | React `makeRxDBProvider<T>()`、`Vue makeRxDBDependencyInjector<T>()` 都能隔离多库实例；**Angular 只有单一 `RxDB` DI token**（`code-reviews/rxdb-angular.md:341` 已点名），多租户/主从库场景无法隔离                                                                                          | 为 Angular 增加 `makeRxDBProviders<T>()` 工厂，返回 `{ provideRxDB, injectRxDB }`；`frameworks/angular.md` 同步补章节（标题占位已存在） |
| 导航       | 🟡 P1 | `sidebars.ts`「插件」分类                                                          | 只列了 `rxdb-plugin-storage`/`-graph`/`-workspace`，**`rxdb-plugin-search` 没有侧边栏入口**；`docs/plugins/rxdb-plugin-search/README.md` 是完整教程文档但孤立                                                                                                                                | 把 `rxdb-plugin-search` 加入教程侧边栏；或合并到适配器章节并加跳转                                                                      |
| 导航       | 🟡 P1 | `docs/compatibility.md` 适配器表格                                                 | 缺 `rxdb-adapter-wa-sqlite` 行——但 `getting-started/README.md`、首页与适配器教程**反复强调**它才是浏览器 SQLite 默认推荐                                                                                                                                                                     | 表格里补 `rxdb-adapter-wa-sqlite` 行，注明「基于 wa-sqlite；推荐浏览器 SQLite」；与 `-sqlite`（官方 wasm）的关系放在脚注                |
| 文案       | 🟢 P2 | `src/pages/comparison.tsx:200-217`                                                 | 首页 `mono-chip` 标签 `Conditional sync` 在 README/compatibility 中**没有清晰解释**——`RxDBOptions.sync` 是声明式配置，没有公开的「按条件 push」运行时 API                                                                                                                                    | 改为「按 namespace / repositoryFilter 选择性 push/pull」；`collaboration/sync.md` 同步补一句精确解释                                    |
| 文案       | 🟢 P2 | `src/pages/comparison.tsx:213` `Cross-tab sync`                                    | `RxDBTabsGateway` 跨标签同步机制没有专门章节                                                                                                                                                                                                                                                 | 新增 `docs/collaboration/cross-tab.md`，解释 BroadcastChannel、`RxDBTabsGateway` 与跨标签冲突语义                                       |
| 文案       | 🟡 P1 | `architecture.tsx` Tech Stack 表格                                                 | 列了 `SQLite / PGlite / TypeScript / RxJS / OPFS / ts-morph`，**没有 `wa-sqlite`**——而首页 `MetricsStrip` 与 hero 都标榜 SQLite + OPFS                                                                                                                                                       | 表格加 `wa-sqlite` 行（与 `PGlite` 并列），区分「推荐」与「高级查询」两个本地执行层                                                     |
| 文案       | 🟢 P2 | `index.tsx:55-59` `heroHighlights`                                                 | 「浏览器内运行 SQLite 查询、事务与索引」措辞正确，但读者无法区分 `wa-sqlite` 与 `sqlite-wasm`                                                                                                                                                                                                | 在 hero `Button` 旁的次级链接里挂一个「查看 SQLite 选型」→ `docs/adapters/README.md`，让读者一眼可对比                                  |

## 优先级汇总

- 🔴 **P0（2 项，必须修）**
  - 删除 `RxDBService` 文档引用（`frameworks/angular.md`）
  - 修正 `createRxDatabase()` 为 `new RxDB().use(...)`（`plugins/rxdb-plugin-search/README.md` + `devtools/README.md`）
- 🟡 **P1（6 项）**
  - `injectSearch` → `useSearch` 文档统一
  - 三端 `useInfiniteScroll` 文档章节
  - Angular `makeRxDBProviders` 工厂 + 文档
  - `rxdb-plugin-search` 教程侧边栏
  - `wa-sqlite` 兼容矩阵条目 + architecture Tech Stack
- 🟢 **P2（4 项）**：typedoc `useGet` 示例字符串简写、首页文案打磨、cross-tab 新章节、hero 二级链接

## 建议执行顺序

1. **P0 一并修**：用一次 commit 删 `RxDBService`、把 `createRxDatabase` 全文替换为 `new RxDB().use(...)`，确保 `pnpm docs` 构建仍绿（`onBrokenLinks: 'throw'` 会兜住）
2. **P1 一并修**：补三端 `useInfiniteScroll` 章节（直接搬运各包 README 段落）；加 `wa-sqlite` 兼容矩阵行；侧边栏加 search；Angular `makeRxDBProviders` 单独 PR（涉及包代码，跨仓评审）
3. **P2 分批**：首页文案与 cross-tab 文档合并到下一次内容同步窗口；typedoc 示例修复列入发版前检查清单

## 验收条件

- `pnpm docs`（或 `nx run website:build`）零 broken-link / broken-anchor 错误
- 三框架对称性自检脚本（`tri-framework-check` skill）跑过：`useGet` / `useFind` / `useCount` / `useInfiniteScroll` / 注入工厂的导出签名一致
- 文档站搜索（`@easyops-cn/docusaurus-search-local`）能命中新增的 `wa-sqlite`、`useSearch`、`useInfiniteScroll` 关键词
- typedoc 生成产物中 `injectSearch` 标记为 `@deprecated`（已验证：`docs/api/rxdb-plugin-search-angular/variables/injectSearch.md` 已有删改线标题和 `## Deprecated` 节）

## 关联记录

- 上一次 website 评审：`REVIEW.md`（2026-07-14，基线 `03a46a5d5`，关注预览服务器目录穿越）
- 三框架对称 skill：`.agents/skills/tri-framework-check/SKILL.md`
- 包级评审：`code-reviews/{rxdb-core,rxdb-react,rxdb-vue,rxdb-angular,rxdb-plugin-search*}.md`
- 评审队列总表：`code-reviews/TODO.md`、`code-reviews/TODO-round2.md`
