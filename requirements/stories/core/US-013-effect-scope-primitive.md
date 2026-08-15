---
id: US-013
title: EffectScope 生命周期作用域原语
status: Backlog
priority: High
epic: epic-008-lifecycle-scope
created: 2026-08-15
updated: 2026-08-15
tags: [lifecycle, utils, primitive, refactor-enabler]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只新增 @aiao/utils 的导出，不改任何既有调用方；单独合并后仓库行为零变化
- [x] Negotiable (可协商): 三处语义（异步 setup 的竞态出口、多错聚合方式、嵌套作用域的表示）在技术笔记里给了决策表
- [x] Valuable (有价值): 它是 epic-008 后续两个故事的地基；单独交付后新代码即可停止手写配对
- [x] Estimable (可估算): ~150 行实现 + ~250 行测试，无外部依赖，无 I/O
- [x] Small (小): 单包单文件夹，不跨包，不改公开行为
- [x] Testable (可测试): 全部语义可用纯内存单测断言，无需 adapter / DOM / 计时器
-->

# 用户故事：EffectScope 生命周期作用域原语

## 作为/我想要/以便

**作为** rxdb 核心与插件的开发者
**我想要** 一个「登记副作用时就同时登记它的撤销方式，作用域结束时逆序自动释放」的原语
**以便** 新增一个副作用时**没有地方**可以忘记写它的清理，而不是靠我记得在 `destroy()` 里补对称的一半

## 来源与边界

来源是 [epic-008](../../epics/epic-008-lifecycle-scope.md) 「现状」表统计出的九处手工配对。
本故事**只交付原语本身**，一处既有配对都不迁移——迁移在
[US-014](US-014-plugin-scope-contract.md) 与后续故事里做。

这样切的原因：原语的语义（逆序、幂等、异步、错误隔离、嵌套）一旦被调用方绑住就很难再改，
必须先用一批只针对语义的测试把它钉死，再让四个插件依赖它。反过来做的话，插件迁移过程中
每发现一个语义漏洞都要同时改原语和四个调用方。

> **本故事不是「给 `@aiao/utils` 立故事」。** [status-overview.md](../../status-overview.md) 的
> 「项目统计」注写明基础设施包不单独立 story。本故事的归属是**核心引擎的生命周期契约**，
> 代码落点恰好在 `@aiao/utils`（选型理由见技术笔记 D1）。该注不需要修改：它排除的是
> 「为 utils 的工具函数补需求覆盖」这类工作，不是「核心契约的实现放在 utils 里」。

## 范围边界

### In Scope

- `EffectScope` 类：`effect()` / `effectAsync()` / `scope()` / `dispose()` 与 `state` / `label`
- `EffectDisposer` / `EffectSetupResult` 类型与 `EffectScopeDisposedError` 错误类型
- 三态状态机 `active` → `disposing` → `disposed` 的完整语义与全部边界行为
- 嵌套作用域：父释放递归释放子，子可独立释放并从父清单摘除
- 从 `@aiao/utils` 主入口导出 + TSDoc + API 基线更新

### Out of Scope

- **迁移任何既有调用方**（`RxDB`、四个插件、三框架绑定）——归 [US-014](US-014-plugin-scope-contract.md) 及后续
- **依赖声明与按需重装**（cordis 的 epoch 语义）——归 [US-015](US-015-plugin-inject-dependency.md)
- **长异步栈追踪**（把 disposer 的错误栈接回 `effect()` 调用点）——独立诊断增强，另起故事
- **响应式集成**：不感知 RxJS `Subscription`、不提供 `scope.subscribe()` 糖；订阅由调用方在 setup 里自行返回 `() => sub.unsubscribe()`
- **全局作用域注册表 / DevTools 可读的作用域树**：本故事不引入任何进程级单例
- **同步版 `dispose()` 重载**：只有一个返回 `Promise<void>` 的 `dispose()`，不提供第二套语义

## 验收标准

| #   | 前置条件                                          | 操作                                                           | 预期结果                                                                                                                                                                            | 状态 |
| --- | ------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 作用域已登记 effect A、B、C（按此顺序）           | `await scope.dispose()`                                        | 清理顺序严格为 C → B → A；`state` 在首个 disposer 执行前已是 `disposing`，全部完成后为 `disposed`                                                                                   | ⬜   |
| 2   | A、B 的 disposer 均返回 Promise                   | `await scope.dispose()`                                        | **串行**执行：B 的 Promise settle 之后 A 才开始；`dispose()` 返回的 Promise 在全部 settle 后才 resolve                                                                              | ⬜   |
| 3   | 已登记 effect 并拿到 `effect()` 返回的 disposer   | 调用该 disposer 两次，再 `await scope.dispose()`               | 底层清理只执行 **1** 次；该 effect 已从作用域清单摘除，`dispose()` 不会再次调用它                                                                                                   | ⬜   |
| 4   | 作用域已 `dispose()`                              | 再次 `await scope.dispose()`（含并发同时调用两次）             | 返回**同一个** Promise，清理总执行次数不变，不抛错                                                                                                                                  | ⬜   |
| 5   | 作用域处于 `disposing` 或 `disposed`              | 调用 `scope.effect(setup)`                                     | 同步抛 `EffectScopeDisposedError`，且 **`setup` 不被执行**（不产生新副作用）；错误消息含作用域 label 与传入的 effect label                                                          | ⬜   |
| 6   | 某个 disposer 的实现内部调用 `scope.effect()`     | `await scope.dispose()`                                        | 该调用抛 `EffectScopeDisposedError`；按 AC#8 的隔离规则，其余 disposer 照常跑完                                                                                                     | ⬜   |
| 7   | `effectAsync(setup)` 的 setup 尚未 settle         | 在 setup pending 期间调用 `scope.dispose()`                    | setup 落地后拿到的 disposer 被**立即执行并等待**（资源不泄漏），随后 `effectAsync` 的 Promise 以 `EffectScopeDisposedError` reject；`dispose()` 的 Promise 在该清理完成后才 resolve | ⬜   |
| 8   | 三个 disposer 中第 2、3 个抛错                    | `await scope.dispose()`                                        | 三个**全部**被调用（不短路）；`dispose()` 以 `AggregateError` reject，`errors` 按**执行顺序**排列；作用域仍进入 `disposed`                                                          | ⬜   |
| 9   | 三个 disposer 中恰好 1 个抛错                     | `await scope.dispose()`                                        | `dispose()` 直接以**该原始错误**reject（不包 `AggregateError`），与 [`RxDB.#runIsolated`](../../../packages/rxdb/src/RxDB.ts#L571-L585) 的首错口径一致                              | ⬜   |
| 10  | 父作用域上依次登记 effect A、子作用域 S、effect B | 在 S 上登记 s1、s2，然后 `await parent.dispose()`              | 顺序为 B → (s2 → s1) → A：子作用域在**它被创建的那个位置**整体释放，不是全部提前或全部推后；S 的 `state` 为 `disposed`                                                              | ⬜   |
| 11  | 子作用域 S 已独立 `dispose()`                     | 随后 `await parent.dispose()`                                  | S 的 disposer 不被二次调用；S 已从父清单摘除；父的其余 effect 正常释放                                                                                                              | ⬜   |
| 12  | setup 返回 `undefined`（无需清理的副作用）        | 登记后 `await scope.dispose()`                                 | 不抛错、不调用任何东西；该 effect 返回的 disposer 可安全调用且为 no-op                                                                                                              | ⬜   |
| 13  | setup 自身同步抛错                                | `scope.effect(setup)`                                          | 错误原样抛给调用方；该 effect **不进入**清单，`dispose()` 时不涉及它；作用域仍为 `active`                                                                                           | ⬜   |
| 14  | 新增的公开导出                                    | 跑 `node scripts/audit/api-surface.mjs --check` 与 lint / test | 基线 [utils.json](../../api-baseline/utils.json) 已同步含新符号；TSDoc 齐全；`@aiao/utils` 四项覆盖率 ≥ **80%**（非核心包档位）                                                     | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> 最容易漏的是 **AC#2（串行）** 与 **AC#10（子作用域按登记位置释放）**。
> 用 `Promise.all` 并发跑 disposer 能让 AC#1 的顺序断言在同步用例下侥幸通过，但会破坏因果：
> 「后登记的依赖先登记的」这一前提在异步清理时就不再成立。子作用域若统一提到最前或最后释放，
> 同样会让「父的资源在子还在用时就被撤销」重新变成可能。

## 技术笔记

### 待冻结的三个决策

#### D1 — `EffectScope` 放哪个包

| 方案                      | 主要风险                                                                                       | 结论        |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| `@aiao/utils`             | 扩大 utils 的定位（从「工具函数」到「运行时构件」）                                            | ✅ **推荐** |
| `@aiao/rxdb`              | `code-editor-*` 等非 rxdb 包用不到；`@aiao/utils` 反向依赖 `@aiao/rxdb` 不可接受，只能各写一份 | ❌          |
| 新建 `@aiao/lifecycle` 包 | 为 ~150 行新增第 30 个公开包，连带 build / 覆盖率 / 基线 / 文档五套配置                        | ❌          |

选 `@aiao/utils` 的实质理由不是「它是杂物箱」，而是**它已经在提供有生命周期的运行时构件**：
`async/AsyncQueueExecutor`、`@browser/leader-election`、`@browser/broadcast-channel-pool` 都不是纯函数，
都需要显式释放。加入 `EffectScope` 是补齐这一类的公共底座，不是定位漂移。

#### D2 — 异步获取资源时的竞态出口

问题：`const res = await open(); scope.effect(() => () => res.close())` —— 如果作用域在 `await` 期间被释放，
登记会抛错，而 `res` 已经被打开且无人关闭。

| 方案                                                   | 主要风险                                                               | 结论        |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------- |
| 只有同步 `effect()`，泄漏交给调用方 try/catch          | 正是本 Epic 要消灭的那类「靠人记得写对称的一半」                       | ❌          |
| `effect()` 接受 async setup，内部处理竞态              | 同一个方法两套语义；同步路径也被迫返回 Promise，最常见的用法反而变难用 | ❌          |
| 独立的 `effectAsync()`，非 active 时自动回收已获取资源 | 多一个 API 名；调用方需要知道该用哪个                                  | ✅ **推荐** |

`effectAsync()` 的语义即 AC#7：await setup → 若作用域已非 `active`，立刻执行并等待拿到的 disposer，
然后 reject。**关键**：这次迟到的清理必须并入当次 `dispose()` 的等待集合，否则 `dispose()` 会在资源
真正关闭之前 resolve，测试就抓不到泄漏。

同步 `effect()` 保持最简：非 active 时**不执行** setup 直接抛（AC#5）。两个方法的分工是
「资源获取是否跨 await」，这条判据可以直接写进 TSDoc。

#### D3 — 多个 disposer 同时抛错时抛什么

| 方案                                | 主要风险                                                     | 结论        |
| ----------------------------------- | ------------------------------------------------------------ | ----------- |
| 只抛首个（同 `#runIsolated`）       | 丢失后续错误；多插件同时失败时只看得到一个                   | ❌          |
| 一律 `AggregateError`               | 单错场景下调用方要多剥一层，与既有 `#runIsolated` 手感不一致 | ❌          |
| 单错原样抛，多错聚合（AC#8 / AC#9） | 调用方需要 `instanceof AggregateError` 分支                  | ✅ **推荐** |

无论哪种方案，**不短路**是硬要求：一个 disposer 抛错绝不能让排在它后面的 disposer 被跳过——
这正是 [`RxDB.#runIsolated`](../../../packages/rxdb/src/RxDB.ts#L571-L585) 已经确立的口径，
本原语只是把它从「事务事件批量派发」推广到「作用域释放」。

### 参考实现

cordis 的 `Fiber.effect()`（`packages/core/src/fiber.ts`）是同类原语的成熟实现，其
**收集 / 逆序 / 异步等待 / 嵌套** 四项语义可以直接借鉴。**不要**连带引入它的另外三样东西：

- `FiberState` 六态与 epoch 重激活——那是插件加载态，属 US-014 / US-015 的范围，且 rxdb 没有服务注册表
- `getTraceable` 的 Proxy 追踪——rxdb 已有 `EntityProxy` 一层代理，再叠一层会让栈与调试同时变糟
- `composeError` / `buildOuterStack` 长栈——可独立交付的诊断增强，不在本故事

同样**不要**把 cordis 作为运行时依赖引入：它是 0.x 且自述 API 未稳定，而 rxdb 要发 29 个公开包。

### 实现约束

- 零外部依赖（不引入 `cosmokit` 等）；不使用 `WeakRef` / `FinalizationRegistry`
- 清单用「自增序号 → 条目」的 `Map` 而非数组：`effect()` 返回的 disposer 需要 O(1) 摘除自身（AC#3），
  数组的 `indexOf` + `splice` 在大量短生命周期 effect 下是 O(n²)
- 逆序释放取「清空清单再反转」，避免释放过程中的清单变动影响迭代
- `label` 只用于诊断与错误消息，不参与身份，允许重复；缺省值 `'anonymous'`
- 估算：实现 ~150 行，测试 ~250 行（14 条 AC 每条至少一个用例，AC#7 / AC#8 各需 2~3 个）

## 实现文件

- `packages/utils/src/lifecycle/effect-scope.ts` — `EffectScope` 类与三态状态机
- `packages/utils/src/lifecycle/effect-scope.interface.ts` — `EffectDisposer` / `EffectSetupResult` / `EffectScopeDisposedError`
- `packages/utils/src/lifecycle/index.ts` — 子目录桶导出
- `packages/utils/src/index.ts` — 主入口追加 `export * from './lifecycle/index.js'` 与 fileoverview 条目
- `packages/utils/src/__tests__/lifecycle/effect-scope.spec.ts` — 语义冻结测试
- `requirements/api-baseline/utils.json` — 新导出符号的基线（`node scripts/audit/api-surface.mjs --update`）

## References

- [epic-008 生命周期作用域](../../epics/epic-008-lifecycle-scope.md) — 九处手工配对的清单与代价
- [US-014 插件作用域契约](US-014-plugin-scope-contract.md) — 本原语的第一个调用方
- [`RxDB.#runIsolated`](../../../packages/rxdb/src/RxDB.ts#L571-L585) — 「不短路 + 首错重抛」的既有口径
- [versioning-policy.md](../../versioning-policy.md) 第 4 节 — API 表面基线工作流
- cordis `packages/core/src/fiber.ts` — 参考实现（不作为依赖引入）
