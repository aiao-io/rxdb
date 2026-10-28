---
id: US-032
title: 跨 Tab 增量 UPDATE 的活查询刷新
status: In Review
priority: High
epic: epic-004-future-features
created: 2026-10-28
updated: 2026-10-29
tags: [core, reactive-query, cross-tab, bug]
---

# 用户故事：跨 Tab 增量 UPDATE 的活查询刷新

## 作为/我想要/以便

**作为** 在多个标签页中使用同一数据库的开发者
**我想要** 另一个标签页更新实体后，当前标签页的计数与列表活查询反映数据库中的结果
**以便** 不会因为当前标签页没有缓存完整实体而一直看到过期的计数或漏掉新匹配的行。

## 症状与证据

订阅 `status = 'active' AND priority = 5` 的计数或列表，在另一个连接把一行的
`status` 从 `inactive` 改成 `active`。当前连接未读过该行时，收到的 UPDATE 只有
`patch: { status: 'active' }` 与 `inversePatch: { status: 'inactive' }`；
`priority` 两侧都缺失，旧门控把两侧都判成不匹配，既不刷新也不合并新行。

复验入口是 [`query_need_refresh_update`](../../../packages/rxdb/src/query/need_refresh_update.ts)
与 [`UpdateDataCache.getSerializedBefore`](../../../packages/rxdb/src/query/merge-update.utils.ts)。
修复前实现见 `git show 7bb16a90:packages/rxdb/src/query/need_refresh_update.ts`：
门控依赖 `task.serialize` 补全实体，缓存未命中时只能用增量字段；序列化还会把残缺实体放进身份缓存，
因此后续事件的缓存命中也不能证明 where 字段完整。

## 范围边界

### In Scope

- 当前实体的 UPDATE 改动了查询读取的列（where、orderBy，树查询再加父列），而这些列补不齐、或缓存比事件新时回 SQL 刷新，覆盖 `count`、`find*` 与树查询；没改读取列的补丁保留原有判定路径。
- 缓存里已有残缺实体时，后续 UPDATE 仍按字段完整性判断。
- 支持嵌套 AND / OR 规则组；JSON 嵌套路径按顶层存储列是否已知判断；经多对一 / 一对一关系的路径按本表外键判断。
- 区分未知字段与明确的 `null`，不把缺失或 `undefined` 当成已知值；JSON 路径的 `= null` 与 SQL 的 `IS NULL` 同义。
- 同一批里同一实体的多条 UPDATE 合并后判定；实体有未保存的编辑时按已持久化的值判定。
- 完整字段能够判定时保留现有增量合并、计数跨界判断与关系查询刷新语义。
- 核心回归与独立数据库连接的活查询用例。

### Out of Scope

- 把跨 Tab UPDATE 事件改成整行传输，或修改宿主事件协议。
- `get()` 空结果回填、INSERT / DELETE 门控及通用缓存水合重构。
- 仓储没有活查询时 UPDATE 不进身份缓存，实例此后停在旧值（登记在 [roadmap 零散收尾项](../../roadmap.md#零散收尾项不成故事随手可带)）。
- count 刷新合并窗口、查询性能优化及新的框架 API。

## 验收标准

| #   | 前置条件                                                                           | 操作                                                    | 预期结果                                                      | 状态 |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| 1   | 当前连接只订阅复合 where 的 count，未缓存目标实体                                  | 另一连接更新其中一个字段，使实体进入或离开匹配范围      | 回 SQL 重数，发出的计数与数据库一致                           | ✅   |
| 2   | 当前连接订阅 find / findAll / findOne / findByCursor，目标行不在结果内且未完整缓存 | 收到使目标行新匹配的稀疏 UPDATE                         | 字段不足时回 SQL，结果包含数据库中完整的新匹配行              | ✅   |
| 3   | 身份缓存里只有此前增量事件形成的残缺实体                                           | 连续收到同一实体的稀疏 UPDATE                           | 不把缓存命中当完整性证明，不永久保留旧结果                    | ✅   |
| 4   | where 包含嵌套规则组或 JSON 路径                                                   | 分别发送缺少顶层列、顶层 JSON 已知但内部键缺失的 UPDATE | 前者回 SQL；后者按现有 JSON 查询语义判定                      | ✅   |
| 5   | where 字段分别明确为 null、undefined 或缺失                                        | 更新相关字段并判断匹配前后态                            | null 是已知值；undefined 与缺失触发 SQL 刷新；结果与 SQL 一致 | ✅   |
| 6   | 完整字段缓存（含合法空规则组）与关系 / exists 查询可用                             | 运行既有增量与关系刷新回归                              | 完整快照保留原有计算路径，关系查询继续由 SQL 刷新             | ✅   |
| 7   | 当前连接订阅 count / find 系查询，目标实体未缓存                                   | 另一连接只改了条件与排序都不读的列                      | 不回 SQL，沿用原有判定路径                                    | ✅   |
| 8   | 排序经多对一关系路径（如 `author.name`）                                           | 分别只改无关列、只改外键                                | 前者走原有增量路径；后者按外键判断，补不齐时回 SQL            | ✅   |
| 9   | 同一批里同一实体有多条 UPDATE                                                      | 门控判定与增量合并                                      | 按合并后的前后态判断，每条补丁都落到缓存实例与结果上          | ✅   |
| 10  | 目标实体有未保存的编辑，或缓存比迟到的事件新                                       | 收到改了条件列的 UPDATE                                 | 前者按已持久化的值判定；后者回 SQL                            | ✅   |
| 11  | 树查询（findDescendants / countDescendants），子节点未缓存                         | 收到只带 where 列的稀疏 UPDATE                          | 父列未知时回 SQL                                              | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 缺失字段表示无法确定匹配结果，应回到数据库查询，不能用默认值代替持久值。
- 只有补丁改了查询读取的列，才要求这些列已知：没改读取列，这一行的匹配状态与排序位置都没变，缓存缺哪一列都不影响结论。findAll 结果外的行同理，不拿残缺补丁判它新匹配：缺失的列在判空条件（`null`、`= null`）下按空算，不匹配的行会被当成新匹配去整查。
- JSON 顶层列已知时，内部键不存在是数据本身的状态，不等于整列未知；它在 SQL 里取出来是 `NULL`，`= null` 按 `IS NULL` 判。
- 关系不是实体实例的自有属性，条件或排序经多对一 / 一对一关系时读本表外键；to-many 关系由既有的关系规则交给 SQL。
- 同批同 id 的多条 UPDATE 先合并（patch 后写覆盖、inversePatch 先写为准），否则只被前一条改过的列在更新后态里看不见。
- where 里认不出的条件（如大写组合子 `'AND'`，SQL 翻译接受、类型与 JS 判定只认小写）收集读取属性时跳过，求值走到时抛带原文的 `RxDBError`、由 `QueryManager` 按任务退回整查；短路没走到它，结论就与它组内的属性无关。
- 变更限于核心查询门控与树插件的接线；Angular / React / Vue 继续消费同一 Repository 结果流。

## 实现文件

- `packages/rxdb/src/query/need_refresh_update.ts` — UPDATE 门控。
- `packages/rxdb/src/query/merge-update.utils.ts` — 同批同 id 事件合并。
- `packages/rxdb/src/query/query-relation.utils.ts` — where 遍历与字段落到实体属性。
- `packages/rxdb/src/query/query-matching.utils.ts` — `= null` 的 `IS NULL` 语义；认不出的条件报带原文的错误。
- `packages/rxdb/src/query/merge_update.ts` — 增量合并与 `get` 只收本类型事件。
- `packages/rxdb-plugin-tree/src/query/merge_update.ts` — 树查询声明父列。
- `packages/rxdb/src/__tests__/query/merge_update.spec.ts` — 核心条件与缺失值回归。
- `packages/rxdb-plugin-tree/src/__tests__/query/merge_tree_update.browser.spec.ts` — 树查询稀疏补丁回归。
- `packages/rxdb-adapter-wa-sqlite/src/__tests__/live-query-cross-connection.spec.ts` — 独立连接活查询验证。

## 验证

以下数字为 2026-10-29 的复跑结果。核心在第三轮评审处理后重跑（该轮只补一条核心用例、改注释）；其余在第二轮修复后跑，第三轮的改动不影响它们。

- 核心测试 2698 条通过（另有 1 条与本故事无关的条件跳过）；lint、typecheck、build 通过。
- 核心覆盖率：Statements 95.56%、Branches 92.14%、Functions 95.77%、Lines 96.25%，均达到核心 90% 门槛。
- wa-sqlite 真实双连接 8 / 8 通过；「只改条件不读的列不重数」在评审前的门控下失败（多一次查询）。primeCache 变体持有残缺实体到最后一次断言，钉住走的是残缺缓存分支。
- 树插件浏览器用例 256 条、graph 192 条、history 439 条、sqlite-core 1576 条、wa-sqlite 1015 条、PGlite 1562 条全部通过。
- Angular / React / Vue 绑定（含树插件三端）没有单独补跨连接用例：本故事不加 API，三端订阅的就是上面验过的 Repository / 树查询结果流。这是共享核心的覆盖，不是三端各自验证。

## References

- [响应式查询](US-006-reactive-queries.md)
- [跨 Tab 同步](US-009-cross-tab-sync.md)
- [未来功能 Epic](../../epics/epic-004-future-features.md)
