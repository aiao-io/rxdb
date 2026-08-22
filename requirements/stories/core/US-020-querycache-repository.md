---
id: US-020
title: 将 QueryCache 接入统一 Repository
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-08-21
updated: 2026-08-21
tags: [core, querycache, repository, sync, swr]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖 HTTP 包。关闭后 supabase 的 QueryCache 配置从空操作变成生产真，并解锁 US-212
- [x] Negotiable: 接线方式（EntityManager 分支实例化 / Repository 委托 / 包装类）在 plan 阶段选；行为契约以本文件 AC 为准
- [x] Valuable: 今天配置 SyncType.QueryCache 是空操作，find 打本地、写入污染 local changelog
- [x] Estimable: 改动集中在 Repository / QueryCacheRepository / EntityManager / selectPrimaryAdapterKind 与其测试
- [ ] Small: 接线（让生产路径走到已有类）和缓存质量（orphan / fingerprint / fail-fast / SWR SQL / 错误分类）失败模式不同。按「交付阶段」A → B 分批；不拆成 US-020a
- [x] Testable: 每条 AC 都能用「配置 QueryCache 后 getRepository / save / mutations 的去向与副作用」断言
-->

# 用户故事：将 QueryCache 接入统一 Repository

## 交付阶段

| 阶段 | 交付                                                                                                                                 | 直接前置 | AC 区段   | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- | ---- |
| A    | 统一 Repository / EntityManager 在 `sync.type === QueryCache` 时走 `QueryCacheRepository`；写路径 remote-then-local；ducks fail-fast | 无       | AC#1～10  | ⬜   |
| B    | 生产缓存质量：orphan 删除、指纹含模式、SWR SQL、错误分类；去掉「不会生效」注释；公开文档不再撒谎                                     | 阶段 A   | AC#11～20 | ⬜   |

阶段顺序有向：先让生产调用打到已有类，再修该类从未被真实 EntityManager 验证过的降级。反过来不成立——先打磨一个没有实例化路径的类，网站上的空操作谎言还在。

**不得在阶段 A 关闭前把 HTTP 包（[US-212](../adapter/US-212-http-adapter.md)）标可发布。** QueryCache 接线独立有价值：supabase 已经声明了 QueryCache ducks（[US-203 AC#6](../adapter/US-203-supabase-adapter.md) ✅），缺的是引擎把它当生产路径。

## 作为/我想要/以便

**作为** 配置了 `SyncType.QueryCache`、同时注册 local sqlite 与 remote 适配器的开发者
**我想要** `rxdb.getRepository(E).find()` / `save()` 真正跑远端权威的 SWR + sqlite 行缓存
**以便** 文档和 `SyncType.QueryCache` 枚举不再是空操作，写入也不再污染本地 changelog

## 问题现状

这不是「类还没写」。`QueryCacheRepository` 存在，单测直接 `new` 它（[QueryCacheRepository.spec.ts](../../../packages/rxdb/src/__tests__/repository/QueryCacheRepository.spec.ts)）。**生产路径从不实例化它。**

### 病灶 1：配置了也不会生效

[sync-options.interface.ts](../../../packages/rxdb/src/entity/sync-options.interface.ts) 的 `SyncType.QueryCache`：

> 统一 Repository 尚未接入 `QueryCacheRepository`，配置该模式当前不会生效。

类上的 `@experimental` 把话说得更死（[QueryCacheRepository.ts](../../../packages/rxdb/src/repository/QueryCacheRepository.ts)）：

> 该类目前**没有生产实例化路径**：`SyncType.QueryCache` 可以配置，但统一 Repository 并未接入它，只有测试直接 `new` 它。

`SyncQueryCache` 要求同时有 `local` + `remote`。网站把 QueryCache 写成已可用。两边都在撒谎，方向相反。

### 病灶 2：写入落到本地 changelog

[selectPrimaryAdapterKind](../../../packages/rxdb/src/entity/primary-adapter.ts) 是写入侧**唯一**判定点：

```ts
export function selectPrimaryAdapterKind(sync: SyncOptions | undefined): PrimaryAdapterKind {
  return !sync?.local && !!sync?.remote ? 'remote' : 'local';
}
```

`'remote'` 仅当只配了 remote；其余一律 `'local'`。QueryCache 配了两端，因此 `Repository.primary$` 走 `local$`（[Repository.ts](../../../packages/rxdb/src/repository/Repository.ts) 注释：`SyncType.None` + 只有 remote 用 `remote$`，**其他情况用 `local$`**）。

`EntityManager.mutations()` 共用这个选择器。配置 QueryCache 的 `save` / `find` 打到统一 `Repository`，写入进 **local changelog**。类里的 `create` / `update` / `delete` 已经是 remote-then-local——生产根本走不到。

### 病灶 3：EntityManager 只认识两种 Repository

构造函数只 `.repository('Repository')` / `.repository('TreeRepository')`。[`#get_entity_repository`](../../../packages/rxdb/src/entity/entity-manager.ts) 按 `metadata.repository` 取 `config.class` 实例化，**从不**看 `sync.type`。`notifyExternalUpdate` 注释里的「QueryCache 更新」是事件路径，不是接线。

`save()` 仍写着「批量走 `localAdapter.mutations`（仅本地）」——相对 `mutations()` 已改用 `resolveBatchPrimaryAdapter` 是过时注释。改写路径时顺手删掉，别再误导下一轮。

### 病灶 4：类本身的降级从未被生产验证

`@experimental` 已经点名。对应代码：

| 符号                       | 今天的行为                                                                                      | 用户能踩到的症状                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `find()`                   | `fingerprint = #getQueryFingerprint(options.where)`，忽略 `localCacheFirst` / `offlineFallback` | 同 where 不同模式共用 inflight，SWR 与标准查询互串        |
| `#getQueryFingerprint`     | 只用 `where` 的 `deterministicStringify`                                                        | 同上                                                      |
| `#getLocalCache`           | 要 `findAll` 再 JS `isEntityMatchWhere`；无 `findAll` → `of([])`                                | 大表全量进内存；sqlite 不会 SQL 过滤；无 duck 则 SWR 装死 |
| `#executeSWRQuery`         | 本地读失败 `console.error` + `of([])`                                                           | 订阅者看不到缓存失败                                      |
| `#wrapWithOfflineFallback` | `catchError((error: Error) => …)` 吞**任何** `Error`                                            | 401 / 校验错误被当成离线，返回脏缓存                      |
| `#executeFindQuery`        | 算 `diff.orphanIds` / 报 `orphanCount`，从不 `deleteByIds`                                      | 远端删了的行永远留在 sqlite                               |
| 空远程 metadata            | `orphanCount: 0` 早退 `return of([])`                                                           | 远端空集时本地孤儿也不清                                  |
| `#getLocalDataByIds`       | 缺 `findByIds` → `of([])`，注释写明「返回空数组」                                               | 缓存命中变成空结果，调用方以为远端没数据                  |

`deleteByIds` 只出现在公开 `delete()`。orphan 清理不是删除 API 的副作用，是 find 同步的一部分——今天缺了。

## 设计决策

### D1 — 接线切在实例化，不切在 `primary$` 的 local/remote 开关

QueryCache 的 `find` 是 `fetchMetadata → diff → findByIds → upsertMany`，不是 `remote.find()`。只把 `primary$` 拨到 `remote$` 会跳过 sqlite 行缓存，也跳过类里已经写好的 remote-then-local 写路径。

阶段 A 必须让 `getRepository` / `EntityManager.create|update|remove` 在 `sync.type === QueryCache` 时落到 `QueryCacheRepository`（或委托给它的包装）。具体是 subclass、compose 还是 EntityManager 分支，plan 阶段选；**行为**是：读走 SWR/metadata-diff，写走类上已有的 remote-then-local。

### D2 — Full / Filter 的写本地契约永不破坏

`selectPrimaryAdapterKind` 今天对「配了 local」一律 `'local'`，这是 Full/Filter 的正确行为。新分支**只**识别 `SyncType.QueryCache`。不得为了 QueryCache 把「有 local 就写 local」改成「有 remote 就写 remote」。

### D3 — QueryCache 批次不得走 `adapter.mutations()` 直写

`resolveBatchPrimaryAdapter` 即使改成对 QueryCache 返回 `'remote'`，`remoteAdapter.mutations()` 仍不会 `upsertMany` 到 sqlite。QueryCache 的 save/mutations 必须进 `QueryCacheRepository.create/update/delete`。与 Full/Filter 实体不得同批；跨 primary kind 继续 `RxDBMixedPrimaryAdapterError`。

### D4 — 缺 duck fail-fast，禁止再降级成 `[]`

必需远程：`fetchMetadata`、`findByIds`。必需本地：`getMetadataByIds`、`upsertMany`、`deleteByIds`。写操作另需远程 `create` / `update` / `delete`（类上已 throw）。阶段 B 把「缺 `findByIds` → `[]`」「缺 `findAll` → SWR 空缓存」收掉，改为可判别错误。

### D5 — 离线写默认 NO

cache 模式离线只读。`offlineFallback` 只对**网络类**错误降级到本地缓存；无缓存则 `NetworkOfflineError`。401、校验、业务错误原样抛。不为 QueryCache 做乐观离线写。

### D6 — 不 inherit US-203 AC#6 / US-006 AC#6

两条都是 ✅，保持 Done。US-203 AC#6 证明 supabase **适配器**有 QueryCache ducks；US-006 AC#6 证明 **类**有 SWR。本故事让它们变成**生产**真，不改那两行勾，不把 AC#6 标 deferred。

### D7 — QueryCache 是可丢弃投影

兼容 [US-306 FR-046](../collaboration/US-306-working-tree-index.md) 的 `mixed_versioned_cache_transaction`：cache upsert/delete/orphan 清理不进 changelog、不进 working tree。本故事**不实现** epic-006。`TreeRepository` + QueryCache 配置期 fail-fast。

## 范围边界

### In Scope

- `sync.type === QueryCache` 时，`rxdb.getRepository(E)` 与 EntityManager 单条/批量写走到 `QueryCacheRepository`
- 只为 QueryCache 把写路径切到 remote-then-local；Full / Filter / None 行为不变
- 缺必需 ducks 时 fail-fast
- 阶段 B 的缓存质量（orphan、指纹、SWR SQL、错误分类）与去掉「不会生效」注释
- 关闭时更新公开文档，去掉 QueryCache 空操作/已可用的互斥谎言
- 生产路径测试（经 `getRepository` / EntityManager），不是只 `new QueryCacheRepository`

### Out of Scope

- HTTP 包（[US-212](../adapter/US-212-http-adapter.md)）
- Full/Filter changelog 同步、`pullChanges` / `mergeChanges`
- 离线写、乐观 UI
- 改 supabase RPC / PostgREST / Realtime
- encryption 当传输层；`plugin:*` 依赖
- 实现 epic-006（只保持 cache 可丢弃，兼容 FR-046）
- 重开已 Done 的 epic-002；改 US-203 / US-006 的 ✅ AC
- 把 QueryCache 做成第三种 adapter kind（不存在这种类型；仍是 local + remote 两个独立注册适配器）

## 验收标准

### 阶段 A — 生产接线

| #   | 前置条件                                                                                                               | 操作                                                           | 预期结果                                                                                                                                                                                                          | 状态 |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体 `sync.type === QueryCache`，local+remote 均已连接，ducks 齐全                                                     | `rxdb.getRepository(E).find({ where })`                        | 走 `QueryCacheRepository.find` 的 metadata-diff / 增量 pull，不走统一 `Repository` 的本地 `find`                                                                                                                  | ⬜   |
| 2   | 同上                                                                                                                   | `create` / `update` / `delete`（含 `EntityManager.save` 单条） | 先远程后本地；远程失败则本地不写；返回远端权威实体                                                                                                                                                                | ⬜   |
| 3   | 对照实体配置 `SyncType.Full` 或 `Filter`                                                                               | 同一套 find / save / mutations                                 | 与本故事之前逐值一致；写入仍落 local                                                                                                                                                                              | ⬜   |
| 4   | QueryCache 实体成功 `create`                                                                                           | 检查 local sqlite 的 changelog / `RxDBChange`                  | QueryCache 写不进 local changelog；本地只有行缓存                                                                                                                                                                 | ⬜   |
| 5   | 一批 mutations 混入 local-primary 与 remote-only 实体                                                                  | `EntityManager.mutations`                                      | 仍抛 `RxDBMixedPrimaryAdapterError`；本故事不放宽                                                                                                                                                                 | ⬜   |
| 6   | 一批 mutations 混入 QueryCache 实体与 Full/Filter 实体                                                                 | `EntityManager.mutations`                                      | 入口预检即拒绝，错误码固定复用 `mixed_versioned_cache_transaction`（[US-306 FR-046](../collaboration/US-306-working-tree-index.md) 已定义，**不得另起名字**）；不得一部分写 changelog、一部分走 remote-then-local | ⬜   |
| 7   | QueryCache 配置齐全但 remote 缺 `fetchMetadata`/`findByIds`，或 local 缺 `getMetadataByIds`/`upsertMany`/`deleteByIds` | `getRepository(E).find()` 或首次写                             | fail-fast，可判别错误；不降级成 `[]`、不静默改走统一 Repository                                                                                                                                                   | ⬜   |
| 8   | `TreeRepository` 实体配置 `SyncType.QueryCache`                                                                        | 初始化或 `getRepository`                                       | fail-fast；不提供半套树 + 缓存                                                                                                                                                                                    | ⬜   |
| 9   | supabase 适配器已注册                                                                                                  | 跑既有 supabase 测试与 RPC 路径                                | 不改 RPC / PostgREST / Realtime；QueryCache 生产路径复用已有 ducks                                                                                                                                                | ⬜   |
| 10  | [QueryCacheRepository.spec.ts](../../../packages/rxdb/src/__tests__/repository/QueryCacheRepository.spec.ts) 已绿      | 补经 `getRepository` / `EntityManager` 的生产路径测试          | 旧单测不回退；新测试证明不再需要测试里手写 `new QueryCacheRepository` 才能打到该类                                                                                                                                | ⬜   |

### 阶段 B — 缓存质量与文档

| #   | 前置条件                                                                 | 操作                                                          | 预期结果                                                                                                        | 状态 |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| 11  | 本地有远端 metadata 里不存在的 id                                        | `find({ where })` 完成同步                                    | 调用 `local.deleteByIds` 删除 orphan；`orphanCount` 与实际删除数一致                                            | ⬜   |
| 12  | 本地有行，远端 `fetchMetadata` 返回空数组                                | `find({ where })`                                             | 清空匹配范围内的本地孤儿，不 `orphanCount: 0` 早退                                                              | ⬜   |
| 13  | 同一 `where`，一次 `localCacheFirst: true`、一次 `offlineFallback: true` | 并发或紧挨着 `find`                                           | inflight key 含模式，互不复用；指纹至少覆盖 `where` + `localCacheFirst` + `offlineFallback`                     | ⬜   |
| 14  | local 未实现 `findByIds`                                                 | 需要读本地新鲜行的 `find` / `findById`                        | fail-fast，可判别错误；不得 `of([])` 装成「没有数据」                                                           | ⬜   |
| 15  | SWR（`localCacheFirst: true`）                                           | 带 `where` 的 `find`                                          | 本地读是 SQL 形态（RuleGroup 下推），不是 `findAll` + JS `isEntityMatchWhere`；适配器无此能力则 fail-fast       | ⬜   |
| 16  | `offlineFallback: true`                                                  | 分别制造网络失败、HTTP 401、业务/校验错误                     | 仅网络类错误可降级到本地缓存（无缓存则 `NetworkOfflineError`）；401 与业务错误原样抛，不包成离线                | ⬜   |
| 17  | 阶段 A+B 行为已落地                                                      | 读 `SyncType.QueryCache` 与 `QueryCacheRepository` 的公开注释 | 不再写「不会生效」「无生产实例化路径」；残留的实验标记（若有）不得与生产路径矛盾                                | ⬜   |
| 18  | supabase + sqlite 按 QueryCache 注册                                     | 走 `getRepository` 复现 US-203 AC#6 / US-006 AC#6 场景        | 两条 Done AC 在生产路径上可复现。不改 US-203 / US-006 的 ✅                                                     | ⬜   |
| 19  | 本故事准备置 `Done`                                                      | 公开文档（website / 能力说明里写 QueryCache 的页面）          | 不得再把 QueryCache 写成「已可用的空操作」或「配置了就会生效」却不提接线；写清远端权威、sqlite 行缓存、离线只读 | ⬜   |
| 20  | QueryCache 写与 orphan 清理发生                                          | 观察 changelog / 变更事件                                     | cache 仍是可丢弃投影，不产生 Full-sync 那种 local changelog 条目（兼容 US-306 FR-046，不实现 epic-006）         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- `SyncType` 本体在 [sync-options.interface.ts](../../../packages/rxdb/src/entity/sync-options.interface.ts)，不要到 `metadata-options.interface.ts` 里找。后者只 re-export。
- `selectPrimaryAdapterKind` 的文件头写明它是「这个实体的写入该落到哪一侧」的**唯一**判定点。QueryCache 的「写」不是选 local 或 remote 一侧 `mutations()`，是 `QueryCacheRepository` 的 remote-then-local。不要为了省事在 kind 枚举上加第三种 `'cache'`——适配器模型仍是两个独立注册适配器 + `SyncType`。
- 401 vs 网络的分类可以在 Repository 层做，但最终必须有稳定、可判别的错误类型，供 US-212 的 HTTP 适配器对齐。不要在 QueryCache 里 `catch (e)` 后猜。
- 阶段 B 的 SWR SQL：复用本地适配器已有的 `find(where)` / query duck，禁止再 `findAll` 进内存。sqlite 族走 SQL；PGlite 同理。无此 duck 的适配器不能声称支持 QueryCache。
- 空远程 metadata 清孤儿时，删除范围是**本次查询匹配到的本地投影**，不是整张表 drop。where 下推之后，本地多出来、远端 metadata 没有的 id 才是 orphan。
- 覆盖率：核心包 `@aiao/rxdb` ≥ 90%。生产路径测试必须经 EntityManager，否则阶段 A 可以在类测试全绿的情况下继续空操作。

## 实现文件

| 文件                                                                                                                  | 阶段 | 说明                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| [packages/rxdb/src/repository/Repository.ts](../../../packages/rxdb/src/repository/Repository.ts)                     | A    | `primary$` / 委托；QueryCache 不再无条件走 `local$`                                                 |
| [packages/rxdb/src/repository/QueryCacheRepository.ts](../../../packages/rxdb/src/repository/QueryCacheRepository.ts) | A+B  | A 被生产实例化；B 修 orphan / 指纹 / fail-fast / SWR / 错误分类                                     |
| [packages/rxdb/src/entity/primary-adapter.ts](../../../packages/rxdb/src/entity/primary-adapter.ts)                   | A    | 写侧判定不得把 QueryCache 继续送进 local changelog；不发明第三 kind                                 |
| [packages/rxdb/src/entity/entity-manager.ts](../../../packages/rxdb/src/entity/entity-manager.ts)                     | A    | `#get_entity_repository` 按 `sync.type` 接入；mutations 不直写 QueryCache；顺手修 `save()` 过时注释 |
| [packages/rxdb/src/entity/sync-options.interface.ts](../../../packages/rxdb/src/entity/sync-options.interface.ts)     | B    | 去掉「配置该模式当前不会生效」                                                                      |
| [packages/rxdb/src/**tests**/repository/](../../../packages/rxdb/src/__tests__/repository/)                           | A+B  | 生产路径 + 缓存质量；保留直接 `new` 的单元测试作为类级回归                                          |
| website 上声明 QueryCache 的文档                                                                                      | B    | AC#19；阶段 A 不强制改网站                                                                          |

## References

- [US-203 Supabase 适配器](../adapter/US-203-supabase-adapter.md) — AC#6 QueryCache ducks 已 ✅；生产接线是本故事
- [US-006 响应式查询](./US-006-reactive-queries.md) — AC#6 类级 SWR 已 ✅；生产接线是本故事
- [US-212 HTTP 远程适配器](../adapter/US-212-http-adapter.md) — 硬前置本故事；本故事不实现 HTTP
- [US-306 FR-046](../collaboration/US-306-working-tree-index.md) — 兼容 cache 排除在 working tree 外，不实现 epic-006
- [epic-004](../../epics/epic-004-future-features.md) — 归入理由：epic-002 已 Done，不得持有未完成故事
