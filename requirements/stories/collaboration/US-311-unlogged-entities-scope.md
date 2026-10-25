---
id: US-311
title: 不写变更日志的实体与插件系统表退出草稿缓存与版本化域
status: In Review
priority: High
epic: epic-006-working-tree-commits
created: 2026-10-15
updated: 2026-10-20
tags: [collaboration, workspace, storage, working-tree, version-control]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 不依赖多检出位的任何阶段；只改草稿缓存的收录判定、版本化域的归类与文档
- [x] Negotiable (可协商): 归类判据（`log: false`）由 owner 2026-10-14 确认的「storage 文件不进版本控制」推出
- [x] Valuable (有价值): 已发布的 workspace + storage 组合每上传一个文件就留一条永久假草稿
- [x] Estimable (可估算): 两个判定函数 + 一处类别改名 + 文档
- [x] Small (小): 不碰捕获、提交、物化与适配器
- [x] Testable (可测试): AC 逐条对应单测、浏览器集成用例与 demo e2e
-->

# 用户故事：不写变更日志的实体与插件系统表退出草稿缓存与版本化域

## 作为/我想要/以便

**作为** 同时装了草稿缓存（`@aiao/rxdb-plugin-workspace`）与 storage 或工作树插件的应用开发者
**我想要** 草稿缓存只收用户新建、尚未保存的实体，版本化域对不写变更日志的实体在每条写入口上给出同一个归类
**以便** `workspace.list()` 不被库自己的簿记行与文件元数据塞满，批量写与 raw 写不被错拦，文档如实说明文件不随版本

## 症状

用 Playwright 在 `dev-rxdb-angular`（装了 storage、workspace 与工作树插件）上从空库走一遍，每步之后直接读 IndexedDB 里
草稿缓存的 `workspace` 对象仓库，按 `namespace:entity` 计数新增的键：

| 步骤                 | 新增的草稿                                  |
| -------------------- | ------------------------------------------- |
| 启动后自动启用工作树 | `rxdb:Commit` ×1                            |
| 写一条 Todo          | `rxdb:WorkingTreeEntry` ×1                  |
| 提交                 | `rxdb:Commit` ×1、`rxdb:CommitChangeSet` ×1 |
| 上传一个文件         | `storage:StorageFileMeta` ×1                |

这些键不会再被清掉：它们留在 `workspace.list()` 与 `cacheCount` 里，新建时广播给其他标签页，每次启动经
`RxDBPluginWorkspace` 的恢复流程读回内存，实体类型已登记的还会在实体缓存里建出标记为未保存的实例。
demo 的草稿页只显示 `entity === 'Todo'` 的条目（`workspace.page.ts` 的 `readWorkspaceEntries`），界面上看不出来，
「重置」也只丢 Todo 草稿。workspace 与 storage 已发布到 npm（`npm view` 均为 0.0.26）：只装这两个包的应用，
每上传一个文件就多一条永久假草稿。

## 根因

由读源码确认：

1. **草稿缓存的系统表名单是模块加载时的快照。** [`RxDBPluginWorkspace.ts`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts)
   的 `SYSTEM_ENTITY_IDENTITIES` 由 `[RxDBBranch, RxDBChange, RxDBMigration, RxDBSync]` 算出，插件经 `registerSystemEntities()`
   追加的系统表（工作树插件贡献的十张）不在其中。核心 [`system-entities.ts`](../../../packages/rxdb/src/system/system-entities.ts)
   对 `SYSTEM_ENTITIES` 写明：「不要在模块加载期把它 `map` 成一份派生常量」。
2. **不写变更日志的实体没有 CREATE / REMOVE 事件。** 实体构造器经 `EntityManager` 的代理派发 NEW（`instantiate()` 同样如此）；
   CREATE / UPDATE / REMOVE 只从 `rxdb_change` 行派生（sqlite-core 与 PGlite 各自的 `handle_rxdb_change.ts`），而 `log: false`
   的表不建变更日志触发器。草稿缓存只在 CREATE / REMOVE 时收尾，`log: false` 实体的草稿于是永远等不到清除。
   `StorageFileMeta` 声明了 `log: false`，由 `StorageService` 经 `entityManager.instantiate()` 造出。
   后来 [US-222](../adapter/US-222-unlogged-entity-delete-live-query.md) 让删行（`remove()` 与批量删除）为这类实体补派 REMOVE；
   保存仍不派 CREATE，草稿照样等不到清除，排除照旧成立。
3. **版本化域对 `log: false` 的业务实体前后不一。** [`versioned-domain.ts`](../../../packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts)
   的 `buildVersionedDomain` 只把 QueryCache 判成 untracked，`StorageFileMeta` 被判成 tracked：事务写入口从不捕获它
   （挂载点 1 只读变更日志增量），批量写入口却按版本化实体拒绝（`gateBulkWrite` 抛 `WorkingTreeWriteRejectedError`），
   raw 写也按版本化表拦截。这违反 epic-006 [版本化域](../../epics/epic-006-working-tree-commits.md#版本化域tracked--untracked)
   的第二条不变量「同一个实体不得在一条写入口上 tracked、在另一条上 untracked」。

## 范围边界

### In Scope

- 草稿缓存不收的实体 = 系统表（每次判定读 `getSystemEntityIdentities()` 的活登记）∪ 关闭变更日志的实体；
  NEW / CREATE / REMOVE 事件、跨标签页的 `add` 消息与启动恢复用同一个判定，恢复时删掉身份自洽的这类存量键
- 版本化域把 `log: false` 的业务实体归为第四类 untracked；`VersionedDomainEntityInput` 新增 `log`，捕获运行时按实体元数据填
- 写入口目标类别 `query_cache` 改名 `untracked`、不捕获理由 `query_cache` 改名 `untracked_target`：这一类从此不止 QueryCache
- 混用守卫（`VersionedDomain.createTransactionGuard()`）只判 QueryCache 与其余实体，与核心 `isQueryCacheBatch` 同口径
- 文档：epic-006 第四类与第一条不变量的措辞、核心 `log` 选项的 TSDoc、storage 与 workspace 的 README 与文档站、
  工作树文档补「不进版本控制的数据」

### Out of Scope

- 让 `log: false` 的写派发 CREATE / UPDATE / REMOVE 事件：各适配器的实体事件都只从变更日志派生，storage 自带 `watch()`。
  其中 REMOVE 后来由 [US-222](../adapter/US-222-unlogged-entity-delete-live-query.md) 补上
- storage 文件转内容寻址：触发条件见 [epic-006 多检出位](../../epics/epic-006-working-tree-commits.md#rxdb-plugin-storage文件不进版本控制)
- 多检出位的任何阶段

## 验收标准

| #   | 前置条件                                                                     | 操作                                                                 | 预期结果                                                                                                                   | 状态 |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 模块加载之后经 `registerSystemEntities()` 登记一张插件系统表                 | 派发它的 NEW 事件                                                    | 不进缓存、不广播、不落盘                                                                                                   | ✅   |
| 2   | 一个 `log: false` 的已登记业务实体                                           | 构造它（NEW）                                                        | 不进缓存、不广播、不落盘                                                                                                   | ✅   |
| 3   | IndexedDB 里有插件系统表或 `log: false` 实体的草稿                           | 启动恢复                                                             | 身份自洽的删掉，不进 `list()`、不计入 `corruptedEntries`；身份不自洽的照旧登记为坏记录                                     | ✅   |
| 4   | 另一个标签页广播这两类实体的 `add`                                           | 收到消息                                                             | 丢弃                                                                                                                       | ✅   |
| 5   | 核心四张系统表；`rxdb` 命名空间下的自定义实体；写变更日志的业务实体          | 派发 NEW                                                             | 前者不收，后两者照收                                                                                                       | ✅   |
| 6   | 版本化域登记一个 `log: false` 的实体                                         | `classifyEntity` / `versionedTables` / `isUntrackedField`            | `'untracked'`；它的表不在 `versionedTables`；每个字段都是 untracked；`log` 缺省或为 `true` 时仍是 tracked                  | ✅   |
| 7   | 捕获运行时按实体元数据建域，库里有 `log: false` 的业务实体与 QueryCache 实体 | `targetClassOf()`                                                    | 两者都是 `'untracked'`，写变更日志的业务实体是 `'versioned'`                                                               | ✅   |
| 8   | 目标类别为 `untracked`                                                       | 任一写入口                                                           | `no_capture`，理由 `untracked_target`                                                                                      | ✅   |
| 9   | 混用守卫                                                                     | 同一事务登记 `log: false` 实体与 tracked 实体；QueryCache 与 tracked | 前者不抛；后者抛 `MixedVersionedCacheTransactionError`                                                                     | ✅   |
| 10  | Angular demo，空库                                                           | 启用 → 写 Todo → 提交；上传一个文件                                  | IndexedDB 草稿仓库里没有 `rxdb:*` 与 `storage:StorageFileMeta` 的键                                                        | ✅   |
| 11  | 文档                                                                         | 收尾                                                                 | epic-006 第四类按 `log: false` 表述、第一条不变量限定为 QueryCache；核心 `log` TSDoc、storage / workspace / 工作树文档同步 | ✅   |
| 12  | 门禁                                                                         | 收尾                                                                 | 三个包的 lint / test / typecheck、workspace 浏览器用例、覆盖率、`audit:requirements`、`audit:api-surface` 全绿             | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

复验方式：AC 1～5 见 `pnpm nx test rxdb-plugin-workspace`（`describe('不收的实体：插件系统表与关闭变更日志的实体')`）与
`pnpm nx run rxdb-plugin-workspace:test-browser`（「关闭变更日志的实体不进草稿缓存」）；AC 6～9 见 `pnpm nx test rxdb-plugin-working-tree`
的 `untracked-domain.spec.ts`、`capture-runtime-mount-points.spec.ts` 与 `write-entry-matrix.spec.ts`；AC 10 见
`pnpm nx e2e dev-rxdb-angular-e2e -- src/storage.spec.ts src/working-tree.spec.ts --grep 草稿缓存`，把 `RxDBPluginWorkspace.ts`
换回改动前的版本时这两条各自报出泄漏的键（`storage:StorageFileMeta:*`；`rxdb:Commit:*` 等四条）；AC 12 见 `pnpm audit:*` 各项。

## 技术笔记

- **判据是 `log: false`，不是 storage 的实体名。** 关闭变更日志的实体不产生 `rxdb_change`：工作树捕获、分支投影、历史与撤销、
  同步推送、实体 CREATE / UPDATE / REMOVE 事件都建在变更日志上，它们一个也看不见它。按名字认 `storage:StorageFileMeta`
  会让工作树插件按字符串依赖 storage 插件，而且放过其余 `log: false` 实体的同一个缺陷。
- **混用守卫为什么只判 QueryCache。** 拒绝混用的理由是写路径不可调和：QueryCache 先写远端再落可丢弃的缓存，其余实体写本地
  并进变更日志，同批执行只会得到一半进了变更历史、一半没有。`log: false` 的实体与版本化实体同走本地事务、同提交同回滚，
  没有这个问题。核心 `isQueryCacheBatch` 本来就只按 QueryCache 分两边。
- **浏览器集成用例的夹具实体改为写变更日志。** `workspace.browser.spec.ts` 的 `Draft` 原本声明了 `log: false`，草稿缓存从此不收这类实体；
  夹具改用缺省的 `log: true`，另加一个 `log: false` 的 `Note` 钉住不收的那一边。
- **草稿缓存的判定每次现算。** 系统表登记簿在 `use()` 时增长、`config.entities` 在各插件安装时增长，缓存一份派生集合会漏掉
  后到的那些，正是根因 1。

## 实现文件

- `packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts` — 草稿收录判定
- `packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts` — 第四类归类与混用守卫
- `packages/rxdb-plugin-working-tree/src/working-tree/{write-entry-matrix,capture-hook}.ts` — 目标类别改名、建域时传 `log`
- `packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts` — `mixed_versioned_cache_transaction` 的文档口径限定为 QueryCache
- `packages/rxdb/src/entity/entity-options.interface.ts` — `log` 选项的 TSDoc
- `apps/dev-rxdb-angular-e2e/src/{storage,working-tree}.spec.ts` — AC 10

## References

- [epic-006 多检出位对 storage 与 workspace 插件的影响](../../epics/epic-006-working-tree-commits.md#对-storage-与-workspace-插件的影响)
- [epic-006 版本化域](../../epics/epic-006-working-tree-commits.md#版本化域tracked--untracked)
