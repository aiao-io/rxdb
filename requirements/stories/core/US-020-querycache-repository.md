---
id: US-020
title: 将 QueryCache 接入统一 Repository
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-08-21
updated: 2026-08-22
tags: [core, querycache, repository, sync, swr]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖 HTTP 包。关闭后 supabase 的 QueryCache 配置从空操作变成生产真，并解锁 US-212
- [x] Negotiable: 接线方式在 plan 阶段选，但三条断层（D9）必须被回答；行为契约以本文件 AC 为准
- [x] Valuable: 今天配置 SyncType.QueryCache 是空操作，find 打本地、写入污染 local changelog
- [x] Estimable: 改动集中在 Repository / QueryCacheRepository / EntityManager / selectPrimaryAdapterKind 与其测试
- [ ] Small: 接线（让生产路径走到已有类）和缓存质量（orphan / fingerprint / fail-fast / SWR SQL / 错误分类）失败模式不同。按「交付阶段」A → B 分批；不拆成 US-020a
- [x] Testable: 每条 AC 都能用「配置 QueryCache 后 getRepository / save / mutations 的去向与副作用」断言
-->

# 用户故事：将 QueryCache 接入统一 Repository

## 交付阶段

| 阶段 | 交付                                                                                                                                          | 直接前置 | AC 区段             | 状态 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------- | ---- |
| A    | 统一 Repository / EntityManager 在 `sync.type === QueryCache` 时走 `QueryCacheRepository`；写路径 remote-then-local；接口断层与能力 fail-fast | 无       | AC#1～10、AC#21～25 | ⬜   |
| B    | 生产缓存质量：orphan 删除、指纹含模式、SWR SQL、错误分类；去掉「不会生效」注释；公开文档不再撒谎                                              | 阶段 A   | AC#11～20           | ⬜   |

阶段顺序有向：先让生产调用打到已有类，再修该类从未被真实 EntityManager 验证过的降级。反过来不成立——先打磨一个没有实例化路径的类，网站上的空操作谎言还在。

**本故事的两个阶段各自解锁 HTTP 包（[US-212](../adapter/US-212-http-adapter.md)）发布门禁的一档**（[roadmap 约束 10](../../roadmap.md#排期约束)）：

| 本故事阶段 | 解锁 US-212 的                                                                         |
| ---------- | -------------------------------------------------------------------------------------- |
| 阶段 A     | 以 `experimental` 发布（README / npm 描述必须写明 experimental，不得给缓存一致性承诺） |
| 阶段 B     | 标 `stable`、给缓存一致性承诺                                                          |

即：**阶段 A 关闭前 HTTP 包不得以任何形式标可发布；阶段 B 关闭前不得标 `stable`。** 代码可并行——门禁卡的是发布动作，不是开工。

> **阶段边界不因实现顺手而移动。** [D8](#d8--本地读一律走-irepository不再依赖-findall--findbyids-两个-optional-duck) 会让 AC#14 / AC#15 在阶段 A 顺带满足。允许提前打勾，但**阶段 B 的门禁语义不变**：US-212 标 `stable` 仍要求 #11～20 全部关闭，不得因「A 已经把 14/15 关了」而认为 B 已过半。

QueryCache 接线独立有价值：supabase 已经声明了 QueryCache ducks（[US-203 AC#6](../adapter/US-203-supabase-adapter.md) ✅），缺的是引擎把它当生产路径。

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

`@experimental` 已经点名。但降级要分成两类看，**混为一谈会让阶段 B 去修一个编译器已经保证的东西**：

**4a. 编译期已保证、不需要运行时 fail-fast 的**（2026-08-22 核对）：

| duck                | 声明位置                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `fetchMetadata`     | `RxDBAdapterRemoteBase` 的 `abstract`（[rxdb-adapter.ts](../../../packages/rxdb/src/rxdb-adapter.ts)） |
| `findByIds`（远程） | `RxDBAdapterRemoteBase` 的 `abstract`                                                                  |
| `getMetadataByIds`  | `RxDBAdapterLocalBase` 的 `abstract`                                                                   |
| `upsertMany`        | `RxDBAdapterLocalBase` 的 `abstract`                                                                   |
| `deleteByIds`       | `RxDBAdapterLocalBase` 的 `abstract`                                                                   |

继承 base 的适配器**不可能缺**这五个。真正需要 fail-fast 的只有一种情况：不继承 base 的自定义适配器对象（见 AC#7）。

**4b. 运行时真的会缺、且今天静默降级的**——注意这两个 duck **不在任何 base 上**，只是 `QueryCacheLocalAdapter` 上的 optional：

| 符号                              | 今天的行为                                                                                       | 用户能踩到的症状                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `#getLocalDataByIds`              | 缺本地 `findByIds` → `of([])`，注释写明「返回空数组」                                            | **缓存命中变成空结果**，调用方以为远端没数据（最严重的一条） |
| `#getLocalCache`                  | 要本地 `findAll` 再 JS `isEntityMatchWhere`；无 `findAll` → `of([])`                             | 大表全量进内存；sqlite 不做 SQL 过滤；无 duck 则 SWR 装死    |
| `find()` / `#getQueryFingerprint` | 指纹只取 `options.where` 的 `deterministicStringify`，忽略 `localCacheFirst` / `offlineFallback` | 同 where 不同模式共用 inflight，SWR 与标准查询互串           |
| `#executeSWRQuery`                | 本地读失败 `console.error` + `of([])`                                                            | 订阅者看不到缓存失败                                         |
| `#wrapWithOfflineFallback`        | `catchError((error: Error) => …)` 吞**任何** `Error`                                             | 401 / 校验错误被当成离线，返回脏缓存                         |
| `#executeFindQuery`               | 算 `diff.orphanIds` / 报 `orphanCount`，从不 `deleteByIds`                                       | 远端删了的行永远留在 sqlite                                  |
| 空远程 metadata                   | `orphanCount: 0` 早退 `return of([])`                                                            | 远端空集时本地孤儿也不清                                     |

`deleteByIds` 只出现在公开 `delete()`。orphan 清理不是删除 API 的副作用，是 find 同步的一部分——今天缺了。

### 病灶 5：`QueryCacheRepository` 与统一 Repository 存在三处接口断层

这是原文完全没写、但阶段 A 一动手就会撞上的部分。`getRepository(E)` 今天返回 `Repository<T>`，其公开面由 [repository.interface.ts](../../../packages/rxdb/src/repository/repository.interface.ts) 的 `IRepository` 与 `Repository._STATIC_METHODS` 定死：

| 断层             | 统一 `Repository`                                                                                                         | `QueryCacheRepository`                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **返回类型**     | `create` / `update` / `remove` 返回 **Promise**；`find` 经 `QueryManager` 返回**实体实例**（带状态机、进 identity cache） | 全部返回 **Observable**，且是适配器给什么就返回什么的**裸数据**                                                       |
| **方法名与形参** | `remove(entity)`、`update(entity, patch)`、`find(FindOptions)`（支持 `limit`/`offset`/`order`）                           | `delete(ids)`、`update(id, data)`、`find({ where, localCacheFirst, offlineFallback })`（**没有** limit/offset/order） |
| **入口数量**     | 8 个静态入口：`get` / `find` / `findOne` / `findOneOrFail` / `findAll` / `findByCursor` / `count` + 基类项                | 只有 `find` / `findById`                                                                                              |

静态方法是在 `EntityManager.init()` 里按 `config.class.staticMethods` 绑到实体类上的。**「把 `config.class` 换成 `QueryCacheRepository`」会同时改掉这三行**：静态入口凭空少 6 个、`await Entity.create()` 从 Promise 变成 Observable、`find()` 回来的东西没有 `save()`。AC#3 要求 Full/Filter 逐值一致，那是拿这套面做基准的——断层不解决，AC#3 无从断言。裁决见 [D9](#d9--接线用委托保住-irepository-门面不换-configclass)。

### 病灶 6：适配器是流，不是实例

`QueryCacheRepository` 的构造签名是 `(entityName, remoteAdapter, localAdapter)`——两个具体对象。而 `rxdb.localAdapter$` / `remoteAdapter$` 是**可重连的流**，[Repository.ts 构造函数注释](../../../packages/rxdb/src/repository/Repository.ts)专门讲过这个坑：

> 带引用计数的缓存：订阅归零即释放，否则这层缓存会把 `rxdb.localAdapter$` 的引用计数永久钉在 1 以上，使上游的适配器缓存永远不会释放 —— 断连重连后仓储仍打向已断开的旧适配器。

在构造期 `firstValueFrom(adapter$)` 拿一次实例塞进 `QueryCacheRepository`，就是把这个已修好的 bug 重新引入 QueryCache 路径。裁决见 [D10](#d10--适配器实例不得在构造期固化)。

## 设计决策

### D1 — 接线切在实例化，不切在 `primary$` 的 local/remote 开关

QueryCache 的 `find` 是 `fetchMetadata → diff → findByIds → upsertMany`，不是 `remote.find()`。只把 `primary$` 拨到 `remote$` 会跳过 sqlite 行缓存，也跳过类里已经写好的 remote-then-local 写路径。

阶段 A 必须让 `getRepository` / `EntityManager.create|update|remove` 在 `sync.type === QueryCache` 时落到 `QueryCacheRepository`（或委托给它的包装）。**行为**是：读走 SWR/metadata-diff，写走类上已有的 remote-then-local。具体形态由 D9 收窄。

### D2 — Full / Filter 的写本地契约永不破坏

`selectPrimaryAdapterKind` 今天对「配了 local」一律 `'local'`，这是 Full/Filter 的正确行为。新分支**只**识别 `SyncType.QueryCache`。不得为了 QueryCache 把「有 local 就写 local」改成「有 remote 就写 remote」。

### D3 — QueryCache 批次不得走 `adapter.mutations()` 直写

`resolveBatchPrimaryAdapter` 即使改成对 QueryCache 返回 `'remote'`，`remoteAdapter.mutations()` 仍不会 `upsertMany` 到 sqlite。QueryCache 的 save/mutations 必须进 `QueryCacheRepository.create/update/delete`。与 Full/Filter 实体不得同批；跨 primary kind 继续 `RxDBMixedPrimaryAdapterError`。

### D4 — 能力校验分两层，不为编译期已保证的东西写运行时兜底

按病灶 4a/4b 分层：

- **继承 base 的适配器**：五个必需 duck 由 `abstract` 保证，**不写运行时检查**（写了也永远走不到，只会拉低分支覆盖率）。
- **不继承 base 的自定义适配器对象**：进入 QueryCache 路径前做一次能力探测，缺任一必需 duck → fail-fast（AC#7）。
- **本地 `findByIds` / `findAll`**：按 D8 直接从依赖里消掉，不再有「缺了怎么办」这个问题。
- **写操作**：远程 `create` / `update` / `delete` 类上已 throw，保持。

禁止再出现「缺能力 → `of([])`」。

### D5 — 离线写默认 NO

cache 模式离线只读。`offlineFallback` 只对**网络类**错误降级到本地缓存；无缓存则 `NetworkOfflineError`。401、校验、业务错误原样抛。不为 QueryCache 做乐观离线写。

### D6 — 不 inherit US-203 AC#6 / US-006 AC#6

两条都是 ✅，保持 Done。US-203 AC#6 证明 supabase **适配器**有 QueryCache ducks；US-006 AC#6 证明 **类**有 SWR。本故事让它们变成**生产**真，不改那两行勾，不把 AC#6 标 deferred。

### D7 — QueryCache 是可丢弃投影

兼容 [US-306 FR-046](../collaboration/US-306-working-tree-commits.md) 的 `mixed_versioned_cache_transaction`：cache upsert/delete/orphan 清理不进 changelog、不进 working tree。本故事**不实现** epic-006。`TreeRepository` + QueryCache 配置期 fail-fast。

### D8 — 本地读一律走 `IRepository`，不再依赖 `findAll` / `findByIds` 两个 optional duck

`QueryCacheLocalAdapter` 上的 `findAll?` / `findByIds?` 是本地读的**唯一**通路，也是病灶 4b 里两条最严重降级的根因。但本地适配器本来就有一条更好的通路：`RxDBAdapterBase.getRepository(EntityType)` 返回的 `IRepository`，它天生支持 `find({ where })` 的 **SQL 下推**、返回**实体实例**、且已被 Full/Filter 路径验证多年。

因此：

| 原调用                                                        | 改为                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#getLocalCache(where)` = `findAll` + JS `isEntityMatchWhere` | `localRepo.find({ where })` —— SQL 过滤，不再全表进内存                                                                                                                                                 |
| `#getLocalDataByIds(ids)` = `findByIds` 或 `of([])`           | `localRepo.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: ids }] } })`（`in` 已在 [query.interface.ts](../../../packages/rxdb/src/repository/query.interface.ts) 里） |

一次改动同时消掉四个问题：缺 `findByIds` 的空结果（AC#14）、SWR 的全量进内存（AC#15）、返回裸数据而非实体实例（AC#21）、以及 D4 里本来要为这两个 duck 写的运行时兜底。

**保留 `QueryCacheLocalAdapter.findAll?` / `findByIds?` 的类型声明**（它们是已发布导出，删除是破坏性变更），但生产路径不再调用；`@deprecated` 标注留到阶段 B 与 AC#17 一起处理。

### D9 — 接线用委托，保住 `IRepository` 门面，不换 `config.class`

针对病灶 5 的三处断层，`subclass` / `换 class` / `EntityManager 分支实例化` 三个候选里只剩一个可行：

- **换 `config.class` 为 `QueryCacheRepository`**：静态入口从 8 个塌到 2 个，`await Entity.create()` 拿到 Observable。**否决**——直接破坏 AC#3 的比较基准与 `EntityManager.create/update/remove` 的 `await repository.create(...)` 契约。
- **`QueryCacheRepository extends Repository`**：要同时满足两套 `find` 形参与两套返回类型，只能靠重载 + 运行时分支，把断层从调用方挪进类里。**否决**——违反「单一职责」，且 `_STATIC_METHODS` 的继承语义（每个子类自己写一份、不沿链累加）会让这层重载极易漏项。
- **委托**：`meta.repository` 仍是 `'Repository'`，`config.class` 不变；统一 `Repository` 在构造期发现 `sync.type === QueryCache` 时持有一个内部 `QueryCacheRepository`，把 `find` 与写路径改道过去，返回值按 `IRepository` 的形状（Promise + 实体实例）适配。**采纳**。

由此确定 QueryCache 实体的入口矩阵（AC#23）。**8 个入口全部支持**，不做 fail-fast：

| 入口                                     | 阶段 A 结论                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `find({ where })`                        | 同步流程跑完后从本地缓存读，返回实体实例                                                    |
| `get(id)` / `findOne` / `findOneOrFail`  | 同上派生，语义与 Full/Filter 一致                                                           |
| `findAll`                                | 等价于不带 `limit` 的 `find`                                                                |
| `count({ where })`                       | 取远端 `fetchMetadata(where)` 的基数（远端权威，且不拉行）                                  |
| `create` / `update` / `remove`           | 委托到类上的 remote-then-local，返回 Promise                                                |
| `find` 带 `limit` / `offset` / `orderBy` | **支持**：`where` 的同步先跑完，`limit`/`offset`/`orderBy` **原样下推给本地 `IRepository`** |
| `findByCursor`                           | **支持**：游标规则已被 `Repository.findByCursor` 合并进 `where`，同步与本地读都是窄查询     |

分页与排序为什么**不是** fail-fast——这条曾按「远端 metadata 没有排序键，客户端排序会与远端不一致」判过死刑，是错的：`fetchMetadata` 是按**整个 `where`** 拉的，同步完成时本地缓存对该 `where` **完整**，因此在本地做 `ORDER BY` / `LIMIT` / `OFFSET` 与远端分页逐值一致，且是 SQL 求值不是内存切片。**对同一个 `where` 反复翻页只同步一次**（第二页起全是 fresh）。

真正的代价是另一回事，必须写进文档而不是伪装成不支持：

> **拉取放大**：`fetchMetadata` 的粒度是 `where`，与 `limit` 无关。`find({ where, limit: 10 })` 命中 100 万行时，会拉 100 万条 metadata 并补齐全部 missing/stale 行。QueryCache 适合**结果集有界**的查询（用 `where` 收窄，而不是靠 `limit` 收窄）。

这是 metadata-first 策略的固有性质，不是缺陷；用 `onSyncStats` 的 `remoteCount` / `pulledCount` 可观测（AC#25）。

### D10 — 适配器实例不得在构造期固化

委托层持有的必须是 `adapter$` 派生流（沿用 `Repository` 现有的 `shareReplay({ bufferSize: 1, refCount: true })` 写法），每次操作从流里取当前适配器。断连→重连后，QueryCache 路径必须打到新适配器（AC#22）。不得在构造函数里 `firstValueFrom(adapter$)`。

### D11 — 错误类型在本故事冻结，US-212 直接引用

「可判别错误」不能停在形容词上：US-212 阶段 A 与本故事**并行开发**，两边各造一套就白做。本故事负责首次定义，全部落在 [RxDBError.ts](../../../packages/rxdb/src/RxDBError.ts)（沿用既有约定：`extends RxDBError` + 设 `name` + `setPrototypeOf`，本仓库不用 `code` 字段区分错误，除下表第三条另有出处）：

| 错误                                                                   | 触发                                               | 判别字段                                                                                                                                                                   | 相关 AC     |
| ---------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `RxDBQueryCacheCapabilityError`                                        | 自定义适配器对象缺必需 duck                        | `missing: string[]`、`side: 'local'\|'remote'`                                                                                                                             | AC#7、AC#14 |
| `RxDBMixedVersionedCacheTransactionError`                              | 一批 mutations 混入 QueryCache 与 Full/Filter 实体 | `code = 'mixed_versioned_cache_transaction'`（[US-306 FR-046](../collaboration/US-306-working-tree-commits.md) 指定的字符串，**本故事首次定义**，US-306 复用不得另起名字） | AC#6        |
| `NetworkOfflineError`（既有）                                          | `offlineFallback` 且无可用缓存                     | 既有                                                                                                                                                                       | AC#16       |
| 元数据校验 violation（既有 `validateEntityMetadataSet` → `RxDBError`） | `TreeRepository` + QueryCache                      | 既有                                                                                                                                                                       | AC#8        |

网络 vs 业务错误的分类谓词也在本故事定义（供 US-212 对齐），不在 `catch` 里猜。

### D12 — fail-fast 的时机按「能不能在配置期知道」划分

原文 AC#7 / AC#8 都写「初始化或首次调用」，「或」让实现二选一、测试写不死。定死：

| 判据                                                                     | 时机                                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 纯元数据可判（`TreeRepository` + QueryCache、`sync` 缺 local 或 remote） | **配置期**：`EntityManager.init()` 的 `validateEntityMetadataSet` 阶段抛，一条违规则全部实体不绑定  |
| 需要适配器才知道（自定义适配器缺 duck）                                  | **首次真正需要该 duck 的调用**（find 或写），错误上抛给调用方，不落 `console`                       |
| 需要调用参数才知道                                                       | **无此类**：D9 已确认 8 个入口全部支持，`limit`/`offset`/`orderBy` 下推本地，不存在按参数拒绝的情况 |

## 范围边界

### In Scope

- `sync.type === QueryCache` 时，`rxdb.getRepository(E)` 与 EntityManager 单条/批量写走到 `QueryCacheRepository`
- 只为 QueryCache 把写路径切到 remote-then-local；Full / Filter / None 行为不变
- 缺必需能力时 fail-fast（按 D4 分层、D12 定时机）
- 本地读改走 `IRepository`（D8）
- 阶段 B 的缓存质量（orphan、指纹、SWR SQL、错误分类）与去掉「不会生效」注释
- 关闭时更新公开文档，去掉 QueryCache 空操作/已可用的互斥谎言
- 生产路径测试（经 `getRepository` / EntityManager），不是只 `new QueryCacheRepository`

### Out of Scope

- HTTP 包（[US-212](../adapter/US-212-http-adapter.md)）
- **按页同步**（让 `fetchMetadata` 只覆盖当前页而非整个 `where`）——排序分页本身在阶段 A 就可用（D9），但拉取放大不在本故事消除；那需要远端 metadata 契约带排序键与页窗口，属新契约
- Full/Filter changelog 同步、`pullChanges` / `mergeChanges`
- 离线写、乐观 UI
- 改 supabase RPC / PostgREST / Realtime
- 删除 `QueryCacheLocalAdapter.findAll?` / `findByIds?` 声明（已发布导出，删除是破坏性变更）
- encryption 当传输层；`plugin:*` 依赖
- 实现 epic-006（只保持 cache 可丢弃，兼容 FR-046）
- 重开已 Done 的 epic-002；改 US-203 / US-006 的 ✅ AC
- 把 QueryCache 做成第三种 adapter kind（不存在这种类型；仍是 local + remote 两个独立注册适配器）

## 验收标准

### 阶段 A — 生产接线

| #   | 前置条件                                                                                                                                                    | 操作                                                           | 预期结果                                                                                                                                                                                                                                                       | 状态 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体 `sync.type === QueryCache`，local+remote 均已连接                                                                                                      | `rxdb.getRepository(E).find({ where })`                        | 走 `QueryCacheRepository.find` 的 metadata-diff / 增量 pull，不走统一 `Repository` 的本地 `find`                                                                                                                                                               | ⬜   |
| 2   | 同上                                                                                                                                                        | `create` / `update` / `remove`（含 `EntityManager.save` 单条） | 先远程后本地；远程失败则本地不写；返回远端权威实体；返回类型仍是 `Promise<InstanceType<T>>`（不是 Observable）                                                                                                                                                 | ⬜   |
| 3   | 对照实体配置 `SyncType.Full` 或 `Filter`                                                                                                                    | 同一套 find / save / mutations                                 | 与本故事之前逐值一致；写入仍落 local                                                                                                                                                                                                                           | ⬜   |
| 4   | QueryCache 实体成功 `create`                                                                                                                                | 检查 local sqlite 的 changelog / `RxDBChange`                  | QueryCache 写不进 local changelog；本地只有行缓存                                                                                                                                                                                                              | ⬜   |
| 5   | 一批 mutations 混入 local-primary 与 remote-only 实体                                                                                                       | `EntityManager.mutations`                                      | 仍抛 `RxDBMixedPrimaryAdapterError`；本故事不放宽                                                                                                                                                                                                              | ⬜   |
| 6   | 一批 mutations 混入 QueryCache 实体与 Full/Filter 实体                                                                                                      | `EntityManager.mutations`                                      | 入口预检即拒绝，抛 `RxDBMixedVersionedCacheTransactionError`，其 `code === 'mixed_versioned_cache_transaction'`（[US-306 FR-046](../collaboration/US-306-working-tree-commits.md) 指定，**不得另起名字**）；不得一部分写 changelog、一部分走 remote-then-local | ⬜   |
| 7   | QueryCache 实体注册的是**不继承 base** 的自定义适配器对象，且缺 `fetchMetadata` / 远程 `findByIds` / `getMetadataByIds` / `upsertMany` / `deleteByIds` 任一 | 首次 `find()` 或首次写                                         | 抛 `RxDBQueryCacheCapabilityError`，`missing` 列出缺失 duck 名；不降级成 `[]`、不静默改走统一 Repository。继承 base 的适配器**不做**这项运行时检查（D4）                                                                                                       | ⬜   |
| 8   | `TreeRepository` 实体配置 `SyncType.QueryCache`                                                                                                             | `EntityManager.init()`（连接期）                               | 配置期即 fail-fast（元数据校验 violation），一条违规则全部实体不绑定；不提供半套树 + 缓存                                                                                                                                                                      | ⬜   |
| 9   | supabase 适配器已注册                                                                                                                                       | 跑既有 supabase 测试与 RPC 路径                                | 不改 RPC / PostgREST / Realtime；QueryCache 生产路径复用已有 ducks                                                                                                                                                                                             | ⬜   |
| 10  | [QueryCacheRepository.spec.ts](../../../packages/rxdb/src/__tests__/repository/QueryCacheRepository.spec.ts) 已绿                                           | 补经 `getRepository` / `EntityManager` 的生产路径测试          | 旧单测不回退；新测试证明不再需要测试里手写 `new QueryCacheRepository` 才能打到该类                                                                                                                                                                             | ⬜   |
| 21  | QueryCache 实体，本地已有缓存行                                                                                                                             | `getRepository(E).find({ where })` 的返回元素                  | 是**实体实例**：有状态机、进 identity cache、`entity.save()` / `remove()` 可用；同一 id 重复查询拿到同一实例。与 Full/Filter 的实例语义逐条一致                                                                                                                | ⬜   |
| 22  | QueryCache 实体已 find 过一次；随后断连并以新适配器实例重连                                                                                                 | 再次 `find()` / 写                                             | 打到**新**适配器实例；旧实例不被引用（构造期不得 `firstValueFrom(adapter$)` 固化，见 D10）                                                                                                                                                                     | ⬜   |
| 23  | QueryCache 实体，远端同一 `where` 命中 N（N > limit）条                                                                                                     | 逐个调用 D9 矩阵里的 8 个入口                                  | 全部工作，无一 fail-fast；`find({ where, limit, offset, orderBy })` 与 `findByCursor` 的结果与「同数据集配 Full 同步时」逐值一致（`limit`/`offset`/`orderBy` 下推本地 `IRepository`，不是内存切片）；对同一 `where` 翻第二页只发生一次远端同步                 | ⬜   |
| 24  | `sync.local.localCacheFirst: true`                                                                                                                          | 不传 `localCacheFirst` 的 `find` / 传 `false` 的 `find`        | 不传时用配置值走 SWR；调用级显式值覆盖配置值（调用 > 配置 > `false`）；该判定进指纹（与 AC#13 同一把尺）                                                                                                                                                       | ⬜   |
| 25  | QueryCache 实体，`where` 命中 N 条                                                                                                                          | `find({ where, limit: 10, onSyncStats })`                      | `remoteCount === N`（**不是** 10）——拉取放大可观测；文档（AC#19）写明 QueryCache 按 `where` 收窄而非按 `limit` 收窄                                                                                                                                            | ⬜   |

### 阶段 B — 缓存质量与文档

| #   | 前置条件                                                                 | 操作                                                                                                                                                                                                                         | 预期结果                                                                                                                                                            | 状态 |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 11  | 本地有远端 metadata 里不存在的 id                                        | `find({ where })` 完成同步                                                                                                                                                                                                   | 调用 `local.deleteByIds` 删除 orphan；`orphanCount` 与实际删除数一致                                                                                                | ⬜   |
| 12  | 本地有行，远端 `fetchMetadata` 返回空数组                                | `find({ where })`                                                                                                                                                                                                            | 清空匹配范围内的本地孤儿，不 `orphanCount: 0` 早退                                                                                                                  | ⬜   |
| 13  | 同一 `where`，一次 `localCacheFirst: true`、一次 `offlineFallback: true` | 并发或紧挨着 `find`                                                                                                                                                                                                          | inflight key 含模式，互不复用；指纹至少覆盖 `where` + `localCacheFirst` + `offlineFallback`                                                                         | ⬜   |
| 14  | 本地缓存有匹配行                                                         | 需要读本地新鲜行的 `find` / `findById`                                                                                                                                                                                       | 经 `IRepository.find` 读到真实行（D8）；不得出现「读不到就当没有」的 `of([])` 路径                                                                                  | ⬜   |
| 15  | SWR（`localCacheFirst: true`）                                           | 带 `where` 的 `find`                                                                                                                                                                                                         | 本地读是 SQL 形态（`where` 下推给 `IRepository`），不是全量 + JS `isEntityMatchWhere`                                                                               | ⬜   |
| 16  | `offlineFallback: true`                                                  | 分别制造网络失败、HTTP 401、业务/校验错误                                                                                                                                                                                    | 仅网络类错误可降级到本地缓存（无缓存则 `NetworkOfflineError`）；401 与业务错误原样抛，不包成离线                                                                    | ⬜   |
| 17  | 阶段 A+B 行为已落地                                                      | 读 `SyncType.QueryCache` 与 `QueryCacheRepository` 的公开注释                                                                                                                                                                | 不再写「不会生效」「无生产实例化路径」；残留的实验标记（若有）不得与生产路径矛盾；`findAll?`/`findByIds?` 标 `@deprecated` 并指向 D8                                | ⬜   |
| 18  | supabase + sqlite 按 QueryCache 注册                                     | 走 `getRepository` 复现 US-203 AC#6 / US-006 AC#6 场景                                                                                                                                                                       | 两条 Done AC 在生产路径上可复现。不改 US-203 / US-006 的 ✅                                                                                                         | ⬜   |
| 19  | 本故事准备置 `Done`                                                      | 改 [website/docs/collaboration/sync.md](../../../website/docs/collaboration/sync.md) 与 [website/docs/adapters/supabase.md](../../../website/docs/adapters/supabase.md)（`website/docs/api/**` 由 typedoc 生成，**不手改**） | 不得再把 QueryCache 写成「已可用的空操作」或「配置了就会生效」却不提接线；写清远端权威、sqlite 行缓存、离线只读、排序分页可用但按 `where` 同步（D9 的拉取放大提示） | ⬜   |
| 20  | QueryCache 写与 orphan 清理发生                                          | 观察 changelog / 变更事件                                                                                                                                                                                                    | cache 仍是可丢弃投影，不产生 Full-sync 那种 local changelog 条目（兼容 US-306 FR-046，不实现 epic-006）                                                             | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- `SyncType` 本体在 [sync-options.interface.ts](../../../packages/rxdb/src/entity/sync-options.interface.ts)，不要到 `metadata-options.interface.ts` 里找。后者只 re-export。
- `selectPrimaryAdapterKind` 的文件头写明它是「这个实体的写入该落到哪一侧」的**唯一**判定点。QueryCache 的「写」不是选 local 或 remote 一侧 `mutations()`，是 `QueryCacheRepository` 的 remote-then-local。不要为了省事在 kind 枚举上加第三种 `'cache'`——适配器模型仍是两个独立注册适配器 + `SyncType`。
- 五个必需 duck 已是 `RxDBAdapterLocalBase` / `RxDBAdapterRemoteBase` 的 `abstract`（[rxdb-adapter.ts](../../../packages/rxdb/src/rxdb-adapter.ts)）。**先确认这一点再写能力检查**，否则会为编译期已保证的分支写永不执行的兜底，并把覆盖率拖下去。
- 本地 `findByIds` / `findAll` 不在任何 base 上，只是 `QueryCacheLocalAdapter` 的 optional duck —— 这正是病灶 4b 的两条根因，按 D8 用 `IRepository` 替掉。
- 401 vs 网络的分类在 Repository 层做，但必须落成 D11 表里的稳定类型，供 US-212 的 HTTP 适配器对齐。不要在 QueryCache 里 `catch (e)` 后猜。
- 空远程 metadata 清孤儿时，删除范围是**本次查询匹配到的本地投影**，不是整张表 drop。where 下推之后，本地多出来、远端 metadata 没有的 id 才是 orphan。
- 覆盖率：核心包 `@aiao/rxdb` ≥ 90%。生产路径测试必须经 EntityManager，否则阶段 A 可以在类测试全绿的情况下继续空操作。

## 实现文件

| 文件                                                                                                                                                    | 阶段 | 说明                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| [packages/rxdb/src/repository/Repository.ts](../../../packages/rxdb/src/repository/Repository.ts)                                                       | A    | 委托层：`sync.type === QueryCache` 时把 find / 写路径改道，保持 `IRepository` 形状（D9、D10）            |
| [packages/rxdb/src/repository/QueryCacheRepository.ts](../../../packages/rxdb/src/repository/QueryCacheRepository.ts)                                   | A+B  | A 被生产实例化 + 本地读改走 `IRepository`（D8）；B 修 orphan / 指纹 / SWR / 错误分类                     |
| [packages/rxdb/src/entity/primary-adapter.ts](../../../packages/rxdb/src/entity/primary-adapter.ts)                                                     | A    | 写侧判定不得把 QueryCache 继续送进 local changelog；不发明第三 kind                                      |
| [packages/rxdb/src/entity/entity-manager.ts](../../../packages/rxdb/src/entity/entity-manager.ts)                                                       | A    | mutations 入口预检（AC#6）；顺手修 `save()` 过时注释                                                     |
| [packages/rxdb/src/entity/metadata-validate.ts](../../../packages/rxdb/src/entity/metadata-validate.ts)                                                 | A    | 配置期 fail-fast（AC#8、D12）：给 `validateEntityMetadataSet` 加规则，经 `formatMetadataViolations` 报错 |
| [packages/rxdb/src/RxDBError.ts](../../../packages/rxdb/src/RxDBError.ts)                                                                               | A    | D11 的三个新错误类型；进 `requirements/api-baseline/rxdb.json`                                           |
| [packages/rxdb/src/entity/sync-options.interface.ts](../../../packages/rxdb/src/entity/sync-options.interface.ts)                                       | B    | 去掉「配置该模式当前不会生效」                                                                           |
| [packages/rxdb/src/**tests**/repository/](../../../packages/rxdb/src/__tests__/repository/)                                                             | A+B  | 生产路径 + 缓存质量；保留直接 `new` 的单元测试作为类级回归                                               |
| [website/docs/collaboration/sync.md](../../../website/docs/collaboration/sync.md) 与 [adapters/supabase.md](../../../website/docs/adapters/supabase.md) | B    | AC#19；`website/docs/api/**` 是 typedoc 产物，不手改                                                     |

## References

- [US-203 Supabase 适配器](../adapter/US-203-supabase-adapter.md) — AC#6 QueryCache ducks 已 ✅；生产接线是本故事
- [US-006 响应式查询](./US-006-reactive-queries.md) — AC#6 类级 SWR 已 ✅；生产接线是本故事
- [US-212 HTTP 远程适配器](../adapter/US-212-http-adapter.md) — 硬前置本故事；本故事不实现 HTTP。D11 的错误类型是两边的对齐点
- [US-306 FR-046](../collaboration/US-306-working-tree-commits.md) — 兼容 cache 排除在 working tree 外，不实现 epic-006；`mixed_versioned_cache_transaction` 由本故事首次定义
- [epic-004](../../epics/epic-004-future-features.md) — 归入理由：epic-002 已 Done，不得持有未完成故事
