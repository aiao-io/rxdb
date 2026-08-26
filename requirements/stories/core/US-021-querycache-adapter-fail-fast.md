---
id: US-021
title: QueryCache 远端适配器缺席时配置期 fail-fast
status: Done
priority: High
epic: epic-004-future-features
created: 2026-08-27
updated: 2026-08-27
tags: [core, querycache, fail-fast, adapter, dx]
---

<!--
INVEST 检查清单:
- [x] Independent: 只动 `metadata-validate.ts` 一处判定与其测试，不依赖任何未关闭故事
- [x] Negotiable: 违规文案与规则名可议；「配置期而非运行时」由 US-020 D12 定死，不再重开
- [x] Valuable: 今天这条配置错误的表现是**页面永远转圈**——无错误、无日志、无超时
- [x] Estimable: 一条校验规则 + 一个 rule 名 + 三条用例
- [x] Small: 单次迭代内可完成
- [x] Testable: 断言 `EntityManager.init()` 抛出的违规集合
-->

# 用户故事：QueryCache 远端适配器缺席时配置期 fail-fast

## 作为/我想要/以便

**作为** 按文档给实体配了 `sync: { type: QueryCache, local, remote }` 的开发者
**我想要** 连接期就被告知「远端适配器没有注册」
**以便** 不必靠猜去解释一个既不返回、也不报错、也不超时的 `find()`

## 问题现状

这不是「校验写漏了一条」。**写路径的同一类病灶早已被修过**，`RxDBMissingPrimaryAdapterError`
的类注释就是那次修复的墓志铭（[primary-adapter.ts](../../../packages/rxdb/src/entity/primary-adapter.ts)）：

> 这条错误替代的是「永远不 settle 的 Promise」：主端的适配器流永不发射时，
> `firstValueFrom` 会静默挂起，调用方既没有结果也没有错误可查。

QueryCache 的**读**路径今天仍停在被修之前的状态。

### 病灶：实体级声明是死的，但类型系统不这么说

`SyncQueryCache` 在类型上**要求**同时给 `local` 与 `remote`，所以下面这段实体声明能过编译、
能过 lint、能过 `EntityManager.init()`：

```ts
sync: {
  type: SyncType.QueryCache,
  local: { adapter: 'wa-sqlite' },
  remote: { adapter: 'http' }
}
```

而 `RxDB.init()` **从不读实体级的 `sync`**，只读库级的（[RxDB.ts](../../../packages/rxdb/src/RxDB.ts)）：

```ts
const { local, remote } = this.#config.sync || {};
if (local) this.#local_adapter_sub.next(local.adapter);
if (remote) this.#remote_adapter_sub.next(remote.adapter);
```

库级 `sync` 里没有 `remote` 时，`#remote_adapter_sub` 停在它的初值 `new BehaviorSubject<string>('')`，
而 `RxDB.remoteAdapter$` 的管道里有 `filter(Boolean)`——空串被吞掉，**这条流一次都不发射**。

`Repository` 为 QueryCache 实体构造主仓储流时用的正是它
（`Repository.#createQueryCachePrimary`，[Repository.ts](../../../packages/rxdb/src/repository/Repository.ts)）：

```ts
return combineLatest([this.rxdb.localAdapter$, this.rxdb.remoteAdapter$]).pipe(
```

`combineLatest` 要求每条输入流**都**发射过至少一次才产出首个值。于是 `primary$` 永不发射，
`find()` 返回的 Observable 永不发射也永不 error，订阅者拿不到任何东西。

用户侧的完整症状：**页面停在加载态，控制台干净，网络面板空白，没有超时**。
没有任何一个可 grep 的字符串能把人引向「库级 sync 少配了 remote」。

### 为什么现有校验接不住

[metadata-validate.ts](../../../packages/rxdb/src/entity/metadata-validate.ts) 里唯一与 QueryCache
有关的规则是 `validateSyncStrategy`，它只判一件事：

```ts
if (sync?.type !== SyncType.QueryCache) return;
if (metadata.repository !== 'TreeRepository') return;
```

即只拦 `TreeRepository` + QueryCache（US-020 AC#8）。**适配器在不在**这个问题没人问。

而它的入参里已经有答案所需的一切——`validateSyncStrategy(collector, metadata, databaseSync)`
的第三个参数就是库级 `sync`。这条判定纯由元数据可得，按 [US-020 D12](./US-020-querycache-repository.md#d12--fail-fast-的时机按能不能在配置期知道划分)
第一行，归属**配置期**。

### 复验方式

源码实证，四个符号一条链：`RxDB.init()` 的 `#config.sync` → `#remote_adapter_sub` 的初值 `''`
→ `remoteAdapter$` 的 `filter(Boolean)` → `#createQueryCachePrimary` 的 `combineLatest`。
现场佐证见 [US-214 落地偏差](../adapter/US-214-http-browser-demo.md#落地偏差)——该 demo 开发时踩中本条，
表现与上述完全一致。

## 范围边界

### In Scope

- `validateSyncStrategy` 增判：QueryCache 实体生效时，库级 `sync` 必须两侧都有 `adapter`
- 违规文案点破「实体级 `sync.remote.adapter` 不被 `RxDB.init()` 读取」这条真正的成因
- 非 QueryCache 实体的既有合法配置（remote-only、local-only）一条都不得被新规则误伤

### Out of Scope

- **不给 `remoteAdapter$` 加超时或兜底值**——那是把静默挂起换成静默超时，症状更难查
- **不让 `RxDB.init()` 去读实体级 `sync` 自动注册适配器**——那是新语义（谁负责 `connect()`、
  多实体声明同名适配器怎么合并），要另开故事讨论，不在一条 fail-fast 里夹带
- 不改 `selectPrimaryAdapterKind`，不发明第三种 `PrimaryAdapterKind`
- 不改 `RxDBMissingPrimaryAdapterError` 的现有触发条件（见 D2）
- 不做适配器**连接失败**的诊断——本故事只管「压根没注册」，连上之后的事另论

## 设计决策

### D1 — 修在配置期，不在首次 `find()`

判据只需要元数据 + 库级配置，不需要适配器实例，因此按 US-020 D12 归配置期：
`EntityManager.init()` 阶段一次性抛，一条违规则全部实体不绑定。

放到首次 `find()` 抛也能消除挂起，但那时错误落在**某一次查询**上，读者会去查那条查询的
`where`；配置期抛则错误紧挨着 `connect()`，指向的正是要改的那份配置。

### D2 — 走元数据违规通道，不复用 `RxDBMissingPrimaryAdapterError`

那个错误的语义是「**批量写**的主端没有适配器」，构造参数是 `PrimaryAdapterKind` + 实体名，
抛点在 `resolveBatchPrimaryAdapter`。QueryCache 的读挂起既不在写路径、也不属于「主端是哪一侧」
这个问题（US-020 D1：QueryCache 跨两侧）。复用它会让这个错误类型同时承担两套语义，
以后谁也说不清 catch 到它意味着什么。

新增一条 `MetadataValidationRule`，与 `unsupportedTreeQueryCache` 同一条通路
（`collector.add` → `formatMetadataViolations`），排序与聚合行为自动一致。

### D3 — 文案必须点破实体级声明是死的

只写「no remote adapter configured」会把读者送回他**已经写对了**的实体装饰器，
在那儿反复确认 `remote: { adapter: 'http' }` 明明写着。文案必须说明：这一侧的适配器名
只在**库级** `sync` 上被读取，实体上的同名字段不参与注册。

这条是可断言的（`expect(message).toContain(...)`），不是文风偏好。

## 验收标准

| #   | 前置条件                                                                                | 操作                          | 预期结果                                                                                                | 状态 |
| --- | --------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体 `sync.type === QueryCache`，库级 `rxdb.config.sync` **没有** `remote`              | `connect()`                   | `EntityManager.init()` 阶段报元数据违规，消息点名实体名与缺失的一侧；不进入任何查询即失败               | ✅   |
| 2   | 同上，但缺的是 `local`                                                                  | `connect()`                   | 同样报违规，消息指明缺 `local`                                                                          | ✅   |
| 3   | 违规消息                                                                                | 读消息文本                    | 含「实体级 `sync` 上的 adapter 名不被 `RxDB.init()` 读取，注册以库级 `sync` 为准」这一意思的说明（D3）  | ✅   |
| 4   | QueryCache 实体，库级 `sync` 两侧齐全                                                   | `connect()` + `find()`        | 不报违规；行为与本故事之前逐值一致                                                                      | ✅   |
| 5   | 对照：`SyncType.Full` / `Filter` / `None` 实体，以及合法的 remote-only、local-only 配置 | `connect()`                   | 一条都不被新规则判违规                                                                                  | ✅   |
| 6   | 多个实体同时违规                                                                        | `connect()`                   | 违规按 `namespace/entity/field/rule` 稳定排序一次性列出（沿用 `compareViolations`），不是撞见第一条就抛 | ✅   |
| 7   | [dev-rxdb-http](../../../apps/dev-rxdb-http/) 删掉库级 `sync.remote` 后                 | `pnpm nx serve dev-rxdb-http` | 页面报可读错误，**不再是无限加载态**——这是本故事的现场复验，不是单测替身                                | ⚠️   |
| 8   | 实现完成                                                                                | 跑核心包门禁                  | `@aiao/rxdb` 覆盖率不回退（≥ 90%）；`MetadataValidationRule` 的 baseline 记录保持一致                   | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#7 记 ⚠️ 而非 ✅：错误确实抛出且可读，无限加载态确实消失，但呈现形态与验收话术里的「页面报」有出入。
见[落地偏差](#落地偏差)。

AC#8 的后半句已按实测改写。原文要求「新增的 `MetadataValidationRule` 成员进
`requirements/api-baseline/rxdb.json`」——**这条前提是错的**，写故事时没去看 baseline 的实际粒度。
它只记导出符号的名字与种类：

```text
{
  "name": "MetadataValidationRule",
  "kind": "type"
}
```

联合成员一个都不在里面。所以加 `missingQueryCacheAdapter` 不产生 baseline diff，
也没有「过 baseline」这一步可做。留下这段而不是删掉验收项，是因为「联合类型加成员算不算
公开 API 变更」这个判断本身没错（见[技术笔记](#技术笔记)），错的只是「baseline 能接住它」。

## 落地偏差

### AC#7 的错误是**控制台**里的，页面是白的

现场复验按验收标准做了：起后端 + `pnpm nx serve dev-rxdb-http`，删掉库级 `sync.remote`，
真浏览器打开 `localhost:4300`。得到的是：

```text
ERROR RxDBError: 实体元数据校验失败（1 项）：
  public.Recipe.sync [missingQueryCacheAdapter] sync: SyncType.QueryCache 生效，但库级 sync 未注册 remote 适配器。……
    at EntityManager.init (main.js:7363)
    at RxDB.init (main.js:15097)
    at RxDB.connect (main.js:15252)
    at ApplicationInitStatus.runInitializers (core:11370)
```

本故事要消除的东西确实消除了：无限加载态没了，成因字符串可 grep，栈顶就指着 `EntityManager.init`。
但「页面报可读错误」这句验收话术落空了半句——**页面是空白的**。原因在 demo 侧而非本故事：
`connect()` 挂在 `provideAppInitializer` 上，initializer 抛错会中止 Angular bootstrap，
根组件根本没渲染，自然没有承载错误 UI 的地方。

不在此故事里补这个 UI，理由是它属于另一类问题：**demo 怎么呈现初始化失败**。
真要补，改的是 [app.config.ts](../../../apps/dev-rxdb-http/src/app/app.config.ts) 的错误呈现策略
（catch 住 initializer 异常、渲染一个降级页），跟「校验规则判得对不对」没有交集。
把它塞进来会让本故事同时改核心校验和 demo 的启动流程，评审时也说不清哪半边在验什么。

复验完成后 `setup_rxdb_http.ts` 已还原成两侧齐全，页面重新正常渲染（317 行、后端版本
`node-sqlite-demo/1.0.0`）——**破坏性改动没有留在仓库里**。

### 一个类型上不可达、运行时可达的分支

`RxDBOptions.sync` 是必填的，所以「库级 sync 整个缺席」在 TS 里写不出来。但
`RxDB.init()` 写的是 `this.#config.sync || {}`——它自己认为这个输入存在。
校验实现按运行时的实际形状处理（`databaseSync: SyncOptions | undefined`），
对应的 init 级用例用一次显式 cast 绕过类型来覆盖这一支，cast 处有注释说明理由。

这条不是缺陷，是记下来备查：如果哪天 `sync` 改成可选，这个分支会从「JS 调用方才够得着」
变成常规路径，届时不需要改实现。

## 技术笔记

- `MetadataValidationRule` 是**导出**的联合类型，加成员在语义上是公开 API 变更——
  下游 `switch` 一条规则名的代码会看见新分支。但 [api-baseline](../../api-baseline/rxdb.json)
  **接不住这类变更**：它只记 `{ "name", "kind" }`，联合成员一个不记。
  所以本故事没有 baseline diff，也不代表 baseline 替这次变更把过关。
  想让联合成员进门禁得先改 baseline 的采集粒度，那是另一件事。
- `validateSyncStrategy` 已经拿到 `databaseSync`，不需要给校验器加新入参。
- 别在 `Repository` 构造函数里判：那时抛出的错误会落在「第一个订阅该实体查询的组件」上，
  与配置的距离比 `connect()` 远得多，且 `Repository` 是按实体懒建的——没被查过的实体不会报。
  对照 `RxDBQueryCacheCapabilityError`（[sync.md](../../../website/docs/collaboration/sync.md)
  「两侧适配器需实现 QueryCache 的必需方法」一节）确实是在构造仓储时抛的，但那条判据需要
  **适配器实例**才能问「有没有 `upsertMany`」，配置期拿不到；本故事的判据是纯元数据，拿得到。
  两者的时机差异出自 US-020 D12 的同一条尺子，不是不一致。
- `filter(Boolean)` 不能改成放行空串：US-212 之前的 `distinctUntilChanged` 顺序修复依赖它
  （[RxDB.ts](../../../packages/rxdb/src/RxDB.ts) `localAdapter$` 的 `@remarks` 讲了断连复位成 `''` 的用法）。
  本故事**不动**这条流。

## 实现文件

| 文件                                                                                                               | 说明                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [packages/rxdb/src/entity/metadata-validate.ts](../../../packages/rxdb/src/entity/metadata-validate.ts)            | `missingQueryCacheAdapterSides` + `validateSyncStrategy` 增判 + 新 `MetadataValidationRule` 成员 |
| [metadata-validate.spec.ts](../../../packages/rxdb/src/__tests__/entity/metadata-validate.spec.ts)                 | AC#1～5 的规则级用例（9 条）                                                                     |
| [entity-manager.querycache.spec.ts](../../../packages/rxdb/src/__tests__/entity/entity-manager.querycache.spec.ts) | AC#1～6 走 `rxdb.init()` 的入口级用例（7 条）                                                    |
| [apps/dev-rxdb-http/src/app/setup_rxdb_http.ts](../../../apps/dev-rxdb-http/src/app/setup_rxdb_http.ts)            | 注释改口径：这条静默悬挂已修，漏配现在是配置期抛错                                               |

## References

- [US-020 将 QueryCache 接入统一 Repository](./US-020-querycache-repository.md) — D12 定的 fail-fast 时机划分；AC#8 是同一条校验通路的先例
- [US-214 HTTP 适配器浏览器端到端 demo](../adapter/US-214-http-browser-demo.md) — 本条在该 demo 开发中被踩中，见其「落地偏差」
- [epic-004](../../epics/epic-004-future-features.md) — 归入理由同 US-020：epic-002 已 `Done`，不得持有未完成故事
