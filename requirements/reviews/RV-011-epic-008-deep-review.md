---
id: RV-011
title: epic-008 生命周期作用域史诗深度评审
status: Open
created: 2026-08-21
updated: 2026-08-21
pr:
---

# Review：epic-008 深度评审

**判定：核心价值没有根本偏离；不能收口。** 横切实现约束的定位、收口判据、新缺口门槛（病灶数 ≥ 抽象数）彼此自洽，US-016 / US-017 移出承诺范围也站得住。挡住 `Done` 的是结算表第 1 条，而且 epic 自己把它写成「一处漏写」——核对源码后，同一条 `catch` 还漏了网关销毁，低估了一处今天能踩到的 BroadcastChannel / LeaderElection 泄漏。结算第 7 条把三个字段打包写成「关闭」，超售。

## 范围与评审方式

| 项       | 值                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 评审对象 | [epic-008](../epics/epic-008-lifecycle-scope.md)                                                                                                           |
| 关联核对 | [US-013](../stories/core/US-013-lifecycle-scope-primitive.md) / [US-014](../stories/core/US-014-plugin-scope-contract.md) / [US-015](../stories/core/US-015-plugin-inject-dependency.md)、[status-overview](../status-overview.md)、[roadmap](../roadmap.md)、[specs/002](../../specs/002-lifecycle-effect-scope/spec.md) |
| 代码核对 | `RxDB.init` / `#shutdown` / `#init_gateway` / `#destroy_plugin`、`VersionManager`、`RxDBTabsGateway`、`EntityManager`、四个插件包、`PluginDependencyScheduler` |
| 评审方式 | 结算表九行逐条对源码；失败路径测试是否真能看见声称的泄漏；承诺范围 / 移出范围 / spec 口径三边对照                                                              |

行号只作导航。断言以符号名与短引用为准。

## 核心价值判定

**没有偏离成产品能力 epic，也没有漂成空转的抽象层。**

愿景写的就是实现约束：「新增一个副作用没有地方可以忘记写它的清理」。epic 自己承认这不是用户可见能力——挂进 epic-001 会让「核心 MVP」失真。这是定位，不是漂移。

支持「值得单列」：graph 注册无处可撤、storage 构造期获取 / 拆卸期释放、workspace `#destroyed` 终态，这三处今天能复现的泄漏已经被 US-014 关掉；search 的自等死锁被 US-015 阶段 A 收进宿主调度器。原语 260 行实现 / 600 行测试（[lifecycle-scope.ts](../../packages/utils/src/lifecycle/lifecycle-scope.ts) / [lifecycle-scope.spec.ts](../../packages/utils/src/__tests__/lifecycle/lifecycle-scope.spec.ts)）对得上承诺范围。

风险不在愿景，在收口叙事：把还活着的泄漏叫「补一行」，又把还活着的两个字段写进「已关闭」。读者会以为只剩一次机械修补。

## 结算表核对

| #   | epic 结算                                                                 | 核对                                                                                                                                                          |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **未关闭**：`init()` `catch` 漏 `versionManager.destroy()`                | **属实且低估**。漏写真实；同一 `catch` 还漏 `#gateway?.destroy()`（P1-1 / P1-2）                                                                               |
| 2   | `#event_initialized` 改判不是病灶                                         | **属实**。守卫在 `RxDB.#init_event()`，监听器挂实例自己的 `#event_map`，防重连重复注册                                                                        |
| 3   | `#plugin_install_promises` 已删                                           | **属实**。生产代码零字段，只剩 [RxDB.plugin-scope.spec.ts](../../packages/rxdb/src/__tests__/RxDB.plugin-scope.spec.ts) 一处历史注释                             |
| 4   | storage 三段 `scope.acquire()`                                            | **属实**。`storage:service` / `storage:property` / `storage:entity`；`#ownsStorage` 只在注释里。epic 行号 44-68，代码现约 48-79                                 |
| 5   | `SearchPluginPhase` 已删                                                  | **属实**。枚举不存在，[plugin.ts](../../packages/rxdb-plugin-search/src/plugin.ts) 只在注释里提                                                                |
| 6   | search 监听走 `scope.acquire()`                                           | **属实**。`RxDBPluginSearch.#bindEntityEvents()` 一条事件一条 `search:entityEvents:*`                                                                         |
| 7   | workspace `#installPromise` / `#installFailed` / `#destroyed` 关闭        | **超售**。`#destroyed` 已删；前两个字段仍在，US-015 Out of Scope 明确不动（P2-1）                                                                              |
| 8   | workspace 纪元释放经 `scope.acquire(..., 'workspace:epoch')`              | **属实**。`RxDBPluginWorkspace.#acquireEpoch()`                                                                                                               |
| 9   | graph `rxdb.repository(..., scope)`                                       | **属实**。`RxDBPluginGraph.install(scope)`                                                                                                                    |

贯穿项：`RxDB.#destroy_plugin()` 已是逆序串行 + 错误隔离不短路，不再是 `Promise.all`。

`plugin:*` 生产消费方：全仓库唯一生产 `inject` 是 search 的 `readonly inject = ['adapter:local'] as const`。调度器注释与契约测试承认阶段 A 恒不解析 `plugin:*`。阶段 B 移出有实证。

US-016 / US-017 故事文件不存在，与 epic「已移出、不单开」一致；与 spec 002 Traceability「后两个文件待创建」不一致（P2-2）。

## Findings

### P1-1：`init()` 失败路径漏 `versionManager.destroy()`，声称的红测试并不覆盖它

- **问题**：`RxDB.init()` 的 `catch` 复位了 `#rxdb_initialized`、`void this.#release_connection_scope()`、`this.#reset_plugin_scheduling()`，没有调 `this.versionManager.destroy()`。`VersionManager.init()` 每次都会 `addEventListener(TRANSACTION_BEGIN / ENTITY_LOCAL_CREATE_EVENT)` 并跑 `#init_sync()` 推进 `#subscriptions` / `#event_removers`；`destroy()` 才清。`#historyManagerDestroyed` 挡住的是二次 `destroy()`，挡不住二次 `init()`。`versionManager.destroy()` 全仓库生产调用点只有 `RxDB.#shutdown()`。
- **用户症状**：`versionManager.init()` 已经跑完之后，`#init_gateway()` 或 `#init_event()` 抛错 → 调用方修配置再 `init()` → undo 失效与同步监听叠一份。redo 栈被打两次、同步监听打两次。
- **测试缺口**：`describe('init() 失败路径与作用域寿命对齐')` 的 AC#22 / AC#23 只 spy `schemaManager.init` 抛 `schema boom`。`schemaManager.init()` 在 `versionManager.init()` **之前**，这条路径根本走不到 VersionManager 泄漏。`VersionManager.spec.ts` 只断言 `destroy()` 两次幂等。
- **根因**：连接作用域总闸落地后，失败回滚只对齐了「插件纪元」那一半；宿主自己的 VersionManager 仍是手工账本，catch 漏写。
- **修复**：`catch` 补 `this.versionManager.destroy()`。红测试必须把抛错点放在 `versionManager.init()` **之后**（spy `#init_gateway` / `RxDBTabsGateway.init` / `#init_event`），断言监听器 / subscription 不叠加。不单开故事——门槛够 bugfix，不够 US-016。

### P1-2：同一条 `catch` 还漏 `#gateway?.destroy()`——epic 写成「一行」是少算

- **问题**：`#shutdown()` 的资源释放是三步：`versionManager.destroy()`、`#gateway?.destroy(); #gateway = undefined`、`entityManager.destroy()`。`init()` `catch` 一步都没做。网关这一步比 VersionManager 更脏：
  1. `RxDB.#init_gateway()` **先赋值再 `init()`**：`this.#gateway = new RxDBTabsGateway(...)` 然后 `this.#gateway.init(...)`。
  2. `RxDBTabsGateway` 构造期就 `createBroadcastTopic(...)`（内部 `new BroadcastChannel`）和 `new LeaderElection(...)`（构造期挂 `beforeunload`）。通道在 `init()` 之前已经打开。
  3. `destroy()` 才 `#topic.close()` + `leaderElection.dispose()`。UTL-009：channel 所有权不再绑 observer 计数，持有方必须显式 `close()`。
  4. `init()` 对已 `destroy()` 的实例抛「不能重新 init()，请创建新实例」——`#destroyed` 是终态。失败后重试会 `new` 第二个网关写进 `#gateway`，旧实例没有引用、也没有人 `destroy()`，后续停机只拆新的那一个。
- **用户症状**：`multiInstance !== false`（默认）下，init 失败一次就泄漏一条 BroadcastChannel 和一套 LeaderElection（Web Locks 或 fallback channel / timer / `beforeunload`）。重试 N 次泄漏 N 份。这不是状态复位，是今天能踩到的资源泄漏，符合 epic 自己的新缺口判据。
- **修复**：`catch` 对齐 `#shutdown()` 的资源三步，至少前两步必做：

```ts
this.versionManager.destroy();
this.#gateway?.destroy();
this.#gateway = undefined;
```

`init()` 是同步 API，这两步本来就是同步的，不需要 `await`。红测试与 P1-1 共用失败点：断言旧网关被 `destroy()` / topic 被 `close()`，重试不得在未销毁的实例上叠通道。修法仍是 bugfix，不是故事；把「补一行」改成「补 catch 与 `#shutdown` 对称的资源销毁 + 两条红测试」。

`entityManager.destroy()` 不升级为 P1：`registerEntityManager` 用 `WeakMap<EntityType, Set<EntityManager>>`，`Set.add` 同一 manager 是空操作，同实例重试不叠第二份、也不误触发「多实例」抛错。`EntityManager.init()` 中途失败会 `unregister` 已绑定类型。漏调的后果是成功跑完 entity 初始化、随后在 version / gateway 失败时缓存可能残留——对称缺口，不是监听器叠加。可随手补，不要单独立项。

`SchemaManager` 没有 `destroy()`，Map 可重入，不是本条病灶。

### P2-1：结算第 7 条把三个字段打包写成「关闭」

- **问题**：结算表第 7 行原文是 workspace 的 `#installPromise` / `#installFailed` / `#destroyed` 关闭（US-014）。源码：`#destroyed` 已删，判据改成 `#indexedDBStore` 随纪元生灭；`#installPromise` 与 `#installFailed` 仍是类字段。`install()` 用它们做 IndexedDB 恢复的单飞 / 失败重试。`#releaseEpochState()` 会把两者复位。US-015 Out of Scope 写明这两个字段等的是 IndexedDB 恢复、不是 rxdb 侧依赖，两阶段都不动。
- **根因**：三个字段曾经是同一套「装了什么以便拆时撤销」账本；US-014 拆掉的是终态 `#destroyed`，另外两个转成纪元内恢复记账，结算表没有改口。
- **是否重开为未关闭**：否。重连能工作，因为纪元释放会清。没有今天用户踩得到的「永远已销毁」症状。按 epic 自己的新缺口判据，这不是第 10 处病灶。
- **修复**：结算第 7 行改口为「`#destroyed` 已删；`#installPromise` / `#installFailed` 是纪元内 IndexedDB 恢复记账，US-015 明确不动，`#releaseEpochState()` 复位，不是终态泄漏」。

### P2-2：spec 002 仍按五条故事链写，和 epic 承诺范围打架

- **问题**：[specs/002](../../specs/002-lifecycle-effect-scope/spec.md) 仍是 Draft，Traceability 把 US-016 / US-017 写成「后两个文件待创建」，口径差异表仍写「Epic 的承诺范围仍只有 US-013 / US-014」，US3 还写 US-015 阶段 A 为 `Backlog`。epic 与 [status-overview](../status-overview.md) 已经是：US-013 / US-014 Done，US-015 阶段 A 交付并 `In Review`，阶段 B / US-016 / US-017 移出。status-overview 已经点名 spec 范围大于 Epic，spec 自己没跟上。
- **根因**：规格创建于 2026-08-15 / 16，epic 在 2026-08-21 改了承诺范围，规格没有同步。规格自己写「冲突时以 epic 为准并同步修订本文件」，这条没兑现。
- **修复**：Traceability 与口径差异表改到与 epic 一致；US-016 / US-017 标「文件不创建、已移出」；US-015 阶段 A 标已交付。不要为了规格完整性去建 US-016 / US-017 文件。

### P3-1：缺「目标」节

epic 模板要求愿景 / 为什么单列 / **目标** / 故事 / 非目标。epic-008 用「收口 / 结算 / 承诺范围」代替「目标」，清单上没有勾选式目标。RV-010 已指出这不是 epic-006 独有。补一节指向结算表零 `未关闭` + 承诺故事均非 `In Progress` 即可，不要另编产品目标。

### P3-2：结算表行号当证据

storage 写 [plugin.ts:44-68](../../packages/rxdb-plugin-storage/src/plugin.ts#L44-L68)，代码在 48-79；若干 RxDB 锚点同样会漂。CONVENTIONS：行号只作辅助，必须跟符号或短引用一起。结算表多数行已经有符号，把过期行号换成符号名即可。

### P3-3：CONVENTIONS 的 epic 状态集合只有 `Backlog`

[CONVENTIONS.md](../CONVENTIONS.md) 状态表把 epic 写成只有 `Backlog`，文件却在用 `In Progress` / `Done`。这是约定洞，不是 epic-008 私有缺陷；收口叙事依赖 `status: In Progress`，约定不认这个值。扩约定，或改 epic 不用未定义状态。

### P3-4：reviews 索引漏登记

[README.md](README.md) 目录表原先只有模板与 README，不列 RV-010。派生索引。本评审落地时补 RV-010 / RV-011。

## 收口评估

epic 自己的两条判据：

1. 结算表没有 `未关闭` 行 — **未满足**。第 1 条仍开；按本评审还应在该行写明网关漏销毁，不能只写 `versionManager.destroy()`。
2. 承诺范围内故事 YAML `status` 均不为 `In Progress` — **已满足**。US-013 / US-014 `Done`，US-015 `In Review`。`In Review` 不是 `In Progress`。阶段 B 已移出承诺范围，不挡这条。

因此：P1-1 + P1-2 的 bugfix 与红测试合入后，epic 可以 `Done`，不必等 US-015 `Done`，也不必开 US-016。US-015 保持 `In Review` 与阶段 B 推迟，和「大故事分阶段、不拆 a/b 文件」一致。

把 catch 三步资源销毁再挂进连接作用域，是可选整洁化，epic 已说明不构成独立用户价值——同意，不要借机把 US-016 捞回来。

## 建议的下一步

1. **先修 P1**：`init()` `catch` 对齐 `#shutdown()` 的 `versionManager.destroy()` + `#gateway?.destroy()` + `#gateway = undefined`（`entityManager.destroy()` 可顺手）。红测试覆盖 version 监听不叠加、旧网关被 close。不单开故事。
2. **改口**：结算第 1 条写清网关；第 7 条按 P2-1 收窄。
3. **派生文档**：spec 002 Traceability / 口径差异对齐 epic；可选补「目标」节。
4. **不要做**：创建 US-016 / US-017 文件；把 `#installPromise` 重开为未关闭行；为对称把 `#event_initialized` 改回病灶。
