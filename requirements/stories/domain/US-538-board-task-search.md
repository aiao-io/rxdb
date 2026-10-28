---
id: US-538
title: 看板任务搜索：FTS 接线
status: Done
priority: Low
epic: epic-011-task-board-domain-model
created: 2026-10-19
updated: 2026-10-21
tags: [domain, board, search]
---

# 用户故事：看板任务搜索：FTS 接线

## 作为/我想要/以便

**作为** 单人看板用户
**我想要** 在当前板内搜任务标题与描述，从结果直接定位卡片
**以便** 找到任务，同时保持当前板的工作上下文

## 范围边界

### In Scope

- **板内搜索**：复用 [US-702](../future/US-702-full-text-search.md) 的全文检索（sqlite-wasm FTS5，中日韩单字 + 双字索引）；
  应用层以 `task.columnId → column.boardId` 确定当前板，不给 task 增加第二份板归属
- **板级搜索源**：提供符合 `SearchSourceLike` 的领域搜索源，三端搜索绑定消费同一实现；
  `SearchOptions.collections` 只选 task 实体，不承担行级隔离
- **过滤与分页**：每次查询一次取全上游命中，与当前板任务求交后在本地分页；上游未返回前保持加载态，
  不显示「无匹配」，也不把上游的 `hasMore` 当成当前板的 `hasMore`
- **结果与定位**：每条结果显示标题、所在列与纯文本匹配片段；点结果滚动到卡片并短暂突出显示，
  不修改列序或卡片顺序；结果已删除时提示「任务已删除」并重查
- **数据更新**：任务创建、编辑、移动、删除及列删除触发当前查询重算；切板立即清空旧板结果，
  搜索词可保留，旧查询不能覆盖新板状态
- **能力边界**：搜索插件未安装或 adapter 不支持时禁用入口并说明原因；查询执行失败显示错误并允许重试，
  不伪装为无匹配，不另做无索引扫描。插件安装失败不是搜索框的局部故障，而是整个库连接失败（见技术笔记）

### Out of Scope

- 跨板全局搜索、标签 / 截止日筛选、附件与语义搜索
- 新分词器、卡片正文关键词着色、全文引擎的行级 scope API
- 跨字段组合查询：引擎逐字段检索，多个词须落在同一字段（标题或描述）才命中
- 后端分词、相关性排序与召回结果的完全一致；三框架对拍使用相同 adapter、同一数据集

## 验收标准

| #   | 前置条件                                                         | 操作                                                 | 预期结果                                                                       | 状态 |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| 1   | 板 B 有「修复登录 bug」「写发布说明」                            | 分别搜「bug」「登录」「发布」                        | 均只显示当前板的命中任务（含词中命中），带标题、列名与匹配片段                 | ✅   |
| 2   | 描述为「回归测试」，标题不含关键词                               | 搜「回归」                                           | 描述命中；标题与描述均进索引，重开后仍可搜                                     | ✅   |
| 3   | 当前板无匹配，上游查询已完成                                     | 搜「zzzz」，再清空输入或只输入标点                   | 完成后显示「无匹配」；空输入或无可索引词元回到未搜索状态，不显示空结果错误     | ✅   |
| 4   | 命中任务在屏幕外；另一个结果已删除                               | 依次点结果                                           | 前者滚动定位且顺序不变；后者提示已删除并刷新列表，不跳入其他板                 | ✅   |
| 5   | 搜索插件未安装 / adapter 不支持 / 查询执行注入失败               | 打开搜索并查询                                       | 前两者入口禁用并说明原因；查询失败显示错误与重试，不显示「无匹配」、不降级扫描 | ✅   |
| 6   | 搜「修复」                                                       | 新建「修复样式」、改名为不命中、跨列移动、删除该任务 | 结果依次加入、移除、更新列归属、移除；更新无需手动重输关键词                   | ✅   |
| 7   | 两板含同词，异板命中排在前面且超过一页，当前板命中过滤后超过一页 | 搜该词并翻页                                         | 当前板命中全部可达、无重复；异板任务不出现；上游返回前保持加载态，不报假空     | ✅   |
| 8   | 两板均命中，旧板查询尚未完成                                     | 切板，再换词或清空                                   | 旧板结果立即清空；迟到结果与错误均不覆盖新查询；关闭页面释放句柄与订阅         | ✅   |
| 9   | 当前查询的上游请求尚未返回                                       | 修改命中任务、删除其列，再等待稳定                   | 旧请求失效，使用新数据重算；无重复任务、悬空列名或迟到结果复活                 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> **验收注记（2026-10-21）**：服务层半边由 node + browser 单测全绿；AC#4 / #9 的 UI 半边
> 随 US-539 阶段 B 三端交付（定位高亮 + 更新中结果由「搜索中」状态接管），三端 e2e 覆盖。

## 技术笔记

**现有 scope 只到实体，不到行。** [`SearchOptions.collections`](../../../packages/rxdb-plugin-search/src/types.ts)
是实体名 / 表名 allowlist；[`RxDBPluginSearch.search()`](../../../packages/rxdb-plugin-search/src/plugin.ts)
在选定表上检索并分页。直接传 task 字段配置无法完成板内搜索，也不能先过滤第一页就判空。
[`SearchResult`](../../../packages/rxdb-plugin-search/src/types.ts) 只有 `entity` / `collection` / `id` / `rank` /
`matchedField` / `snippet`，没有板或列字段，`snippet` 已去掉高亮标记、是纯文本。

**一次取全，不翻上游页。** 插件的翻页不是同一查询的连续切片：第 0 页取 `pageSize + 1` 条，首次 `loadMore()`
另发一次 10 页的池查询（`plugin.ts` 中 `LOAD_MORE_POOL_PAGES` 的说明），而 FTS 语句只有 `ORDER BY rank`
（SQLite 的 [`search-engine.ts`](../../../packages/rxdb-plugin-search/src/core/search-engine.ts) 与 PG 的
`pg-search-sql.ts` 同构，只有兜底语句带主键次序）。推断：同分记录在两次 LIMIT 不同的查询里次序可以不同，句柄按页拼接、不去重，页边界上可能
重复也可能漏项，本地去重补不回漏项。所以板级搜索源不调用 `loadMore()`。集合内缺少确定次序是 search 插件的
既有缺陷，另行在包内修复，不在本故事处理。

领域搜索源对外沿用 [`SearchSourceLike` / `SearchHandle`](../../../packages/rxdb-plugin-search/src/types.ts)，
状态机复用公开的 [`createSearchHandle()`](../../../packages/rxdb-plugin-search/src/core/search-handle.ts)（三端绑定都接受任意
`SearchSourceLike`）。一次查询按以下步骤执行：

1. 捕获当前 `boardId`、查询词与本次请求代次。空输入或无可索引词元回到 idle：`isSearchableQuery` 传入后端的编译判定
   （公开 `resolveSearchBackend(...).compile`），结束本次查询。
2. 建一个一次性的上游句柄，`SearchOptions.pageSize` 设为 task 总数，使全部命中在第 0 页一次返回；等待成功、空或失败状态后
   立即销毁。失败进入错误态，不把部分结果当作完整结果。
3. 看板视图已加载当前板的全部列与任务，命中 id 与其求交即完成板级过滤，无须再按 id 批量读库；删除的任务 / 列
   自然不在其中。补出标题与列名，按 `rank`、再按任务 `id` 排序，结果确定。
4. 对完整的板内结果分页，板级 `hasMore` 由剩余板内结果计算；只有本次请求仍有效时才发布结果。
5. 任务 / 列的数据变更使本次请求失效并重查；切板、换词、清空、恢复切库与关闭页面同样使旧请求失效并释放资源。

数据事件用公开的 `RxDB.addEventListener` 订阅 task 与 column 的本地创建 / 更新 / 删除事件（事务内的事件在 COMMIT
后派发）；插件内部的 `#bindEntityEvents()` 只认可搜索实体，监听不到 column，所以领域源自己订阅两者。重新查询时可
保留同板上次结果并标记「更新中」，此时禁止点击旧结果；切板必须直接清空。

收集成本随全部板的关键词命中数增长，不宣称索引内行级过滤或规模性能。第 0 步使用多板样本核对可接受性；
若真实使用需要大规模行级搜索，先修订对应故事，将搜索底座增量与领域功能在同一 PR 中统一评审、验证，不能在领域分支偷加内部接口或截断结果。

**失败的三种来源要分开。** 插件未安装时 `db.getPlugins('search')` 为空；adapter 不支持在安装期同步抛
`SearchUnsupportedAdapterError`，可先用公开的 `lookupSearchBackendDescriptor` 预检——这两种禁用入口。
插件安装失败（如已有库的可搜索字段集变化抛 `SearchSchemaMismatchError`）会让 `plugin.ready` reject，
宿主 [`awaitPluginInstalls`](../../../packages/rxdb/src/rxdb.plugin-lifecycle.ts) 随即抛出，整个 `db.connect()` 失败——
这属于应用的连接失败页，不在搜索框局部重试；可搜索字段随首版 schema 定稿（US-536）正是为了不在升级时触发它。
查询执行失败经句柄 `error$` 给出 `SearchExecutionError`，可 `retry()`。

**中文搜索沿用实际后端契约。** sqlite-wasm 的 FTS5 索引侧同时写单字与双字（[`cjk-bigram.ts`](../../../packages/rxdb-adapter-sqlite-core/src/fts5/cjk-bigram.ts)
的 `toIndexTokens`），查询侧两字以上编译成双字的 AND 链，所以「登录」能命中「修复登录 bug」这类词中位置。
不承诺词典级分词与召回排序，不改变既有搜索引擎的召回预算。

**关闭条件**：板内隔离、完整分页、结果定位、变更重查与请求失效全部可复验；不支持、查询失败与连接失败能被用户区分。
US-538 依赖 US-534 / US-536 的实体与字段，搜索 UI 由 US-539 阶段 B 消费；本故事不反向依赖 UI。

## 价值待证

本故事随 [epic-011 解锁记录](../../epics/epic-011-task-board-domain-model.md#价值待证整个-epic)
解锁（2026-10-19，owner 决定）。新增工作是板级搜索源、归属过滤与分页协调，不新增全文检索原语；
演示价值入场的依据与边界见 epic。

## 实现文件

- `packages/rxdb-plugin-board/` — 已建；板级搜索源、归属过滤、本地分页与请求失效

## References

- [epic-011 任务看板领域模型](../../epics/epic-011-task-board-domain-model.md)
- [US-702 全文搜索](../future/US-702-full-text-search.md) — 全文引擎（FTS5 与中日韩单双字补偿）、搜索句柄与三端绑定
- [US-534 看板领域模型骨架](US-534-board-column-task-skeleton.md) — 前置：task / column 归属
- [US-536 任务详情与编辑](US-536-task-detail-editing.md) — 前置：task 描述字段与可搜索声明
