---
id: US-013
title: LifecycleScope 生命周期作用域原语
status: Backlog
priority: High
epic: epic-008-lifecycle-scope
created: 2026-08-15
updated: 2026-08-16
tags: [lifecycle, utils, primitive, refactor-enabler]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只新增 @aiao/utils 的导出，不改任何既有调用方；单独合并后仓库行为零变化
- [x] Negotiable (可协商): 三处语义（命名与方法名、原语落包、多错聚合方式与手动 disposer 失败口径）在技术笔记里给了决策表
- [x] Valuable (有价值): 它是 epic-008 后续全部故事的地基；单独交付后新代码即可停止手写配对
- [x] Estimable (可估算): ~120 行实现 + ~250 行测试，无外部依赖，无 I/O
- [x] Small (小): 单包单文件夹，不跨包，不改公开行为
- [x] Testable (可测试): 全部语义可用纯内存单测断言，无需 adapter / DOM / 计时器
-->

# 用户故事：LifecycleScope 生命周期作用域原语

## 作为/我想要/以便

**作为** rxdb 核心与插件的开发者
**我想要** 一个「获取资源时就同时登记它的释放方式，作用域结束时逆序自动释放」的原语
**以便** 新增一处资源获取时**没有地方**可以忘记写它的释放，而不是靠我记得在 `destroy()` 里补对称的一半

## 来源与边界

来源是 [epic-008](../../epics/epic-008-lifecycle-scope.md) 「现状」表统计出的九处手工配对。
本故事**只交付原语本身**，一处既有配对都不迁移——迁移在
[US-014](US-014-plugin-scope-contract.md) 与后续故事里做。

这样切的原因：原语的语义（逆序、幂等、异步释放、错误隔离、嵌套）一旦被调用方绑住就很难再改，
必须先用一批只针对语义的测试把它钉死，再让四个插件依赖它。反过来做的话，插件迁移过程中
每发现一个语义漏洞都要同时改原语和四个调用方。

> **命名与方法名在本故事内一次裁决完毕**（技术笔记 D1）。原语一旦从 `@aiao/utils` 主入口发布，
> 就会进入全部下游项目；`@aiao/utils` 同时被 `rxdb-vue` 使用，而 Vue 3.5 自己导出
> `EffectScope` / `effectScope()`，Angular 导出 `effect()`——同名不同义是最贵的一类命名错误，
> 不能留到实现期再定。
>
> **本故事不是「给 `@aiao/utils` 立故事」。** [capability-matrix.md](../../capability-matrix.md) 的
> 「项目统计」注写明基础设施包不单独立 story。本故事的归属是**核心引擎的生命周期契约**，
> 代码落点恰好在 `@aiao/utils`（选型理由见技术笔记 D2）。该注不需要修改：它排除的是
> 「为 utils 的工具函数补需求覆盖」这类工作，不是「核心契约的实现放在 utils 里」。

## 范围边界

### In Scope

- `LifecycleScope` 类：`acquire()` / `child()` / `dispose()` 与 `state` / `label`
- `ScopeDisposer` / `AcquireResult` 类型与 `LifecycleScopeDisposedError` 错误类型
- 三态状态机 `active` → `disposing` → `disposed` 的完整语义与全部边界行为
- 嵌套作用域：父释放递归释放子，子可独立释放并从父清单摘除
- 从 `@aiao/utils` 主入口导出 + TSDoc + API 基线更新

### Out of Scope

- **迁移任何既有调用方**（`RxDB`、四个插件、三框架绑定）——归 [US-014](US-014-plugin-scope-contract.md) 及后续
- **依赖声明与按需重装**——归 [US-015](US-015-plugin-inject-dependency.md) 系列
- **`acquireAsync()` 与它的 `AbortSignal` 取消出口**——本 Epic 全链条零调用方，推迟到出现第一个
  「资源获取跨 `await`」的调用方时再加（判据与已选定的形状见技术笔记「已推迟」一节）。
  `dispose()` 的**异步性保留**：它返回 `Promise<void>`，因为 `storage.destroy()` 这类释放侧确实是异步的
- **长异步栈追踪**（把 disposer 的错误栈接回 `acquire()` 调用点）——独立诊断增强，另起故事
- **响应式集成**：不感知 RxJS `Subscription`、不提供 `scope.subscribe()` 糖；订阅由调用方在 setup 里自行返回 `() => sub.unsubscribe()`
- **全局作用域注册表 / DevTools 可读的作用域树**：本故事不引入任何进程级单例
- **同步版 `dispose()` 重载**：只有一个返回 `Promise<void>` 的 `dispose()`，不提供第二套语义
- **超时强制释放**：`dispose()` 不内置计时器。本故事的 `acquire()` setup 是同步的，不存在「等一个永不返回的
  底层打开操作」这一挂起源；该风险随 `acquireAsync()` 一起推迟

## 验收标准

| #   | 前置条件                                           | 操作                                                           | 预期结果                                                                                                                                               | 状态 |
| --- | -------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 作用域已登记 A、B、C（按此顺序）                   | `await scope.dispose()`                                        | 释放顺序严格为 C → B → A；`state` 在首个 disposer 执行前已是 `disposing`，全部完成后为 `disposed`                                                      | ⬜   |
| 2   | A、B 的 disposer 均返回 Promise                    | `await scope.dispose()`                                        | **串行**执行：B 的 Promise settle 之后 A 才开始；`dispose()` 返回的 Promise 在全部 settle 后才 resolve                                                 | ⬜   |
| 3   | 已登记条目并拿到 `acquire()` 返回的 disposer       | 调用该 disposer 两次，再 `await scope.dispose()`               | 底层清理只执行 **1** 次；该条目已从作用域清单摘除，`dispose()` 不会再次调用它                                                                          | ⬜   |
| 4   | 作用域已 `dispose()`（**首次成功**）               | 再次 `await scope.dispose()`（含并发同时调用两次）             | 返回**同一个** Promise 实例，清理总执行次数不变，不抛错                                                                                                | ⬜   |
| 4b  | 作用域首次 `dispose()` 已 **reject**（AC#7 / #8）  | 捕获后再次 `await scope.dispose()`                             | 返回**同一个**已 reject 的 Promise 实例（同一错误对象，`AggregateError` 的 `errors` 不变）；disposer 总执行次数不变，**不重试**、不新增错误            | ⬜   |
| 5   | 作用域处于 `disposing` 或 `disposed`               | 调用 `scope.acquire(setup)`                                    | 同步抛 `LifecycleScopeDisposedError`，且 **`setup` 不被执行**（不产生新资源）；错误消息含作用域 label 与传入的条目 label                               | ⬜   |
| 6   | 某个 disposer 的实现内部调用 `scope.acquire()`     | `await scope.dispose()`                                        | 该调用抛 `LifecycleScopeDisposedError`；按 AC#7 的隔离规则，其余 disposer 照常跑完                                                                     | ⬜   |
| 7   | 三个 disposer 中第 2、3 个抛错                     | `await scope.dispose()`                                        | 三个**全部**被调用（不短路）；`dispose()` 以 `AggregateError` reject，`errors` 按**执行顺序**排列；作用域仍进入 `disposed`                             | ⬜   |
| 8   | 三个 disposer 中恰好 1 个抛错                      | `await scope.dispose()`                                        | `dispose()` 直接以**该原始错误**reject（不包 `AggregateError`），与 [`RxDB.#runIsolated`](../../../packages/rxdb/src/RxDB.ts#L579-L593) 的首错口径一致 | ⬜   |
| 9   | 父作用域上依次登记 A、子作用域 S、B                | 在 S 上登记 s1、s2，然后 `await parent.dispose()`              | 顺序为 B → (s2 → s1) → A：子作用域在**它被创建的那个位置**整体释放，不是全部提前或全部推后；S 的 `state` 为 `disposed`                                 | ⬜   |
| 10  | 子作用域 S 已独立 `dispose()`                      | 随后 `await parent.dispose()`                                  | S 的 disposer 不被二次调用；S 已从父清单摘除；父的其余条目正常释放                                                                                     | ⬜   |
| 11  | setup 返回 `undefined`（无需释放的副作用）         | 登记后 `await scope.dispose()`                                 | 不抛错、不调用任何东西；该条目返回的 disposer 可安全调用且为 no-op                                                                                     | ⬜   |
| 12  | setup 自身同步抛错                                 | `scope.acquire(setup)`                                         | 错误原样抛给调用方；该条目**不进入**清单，`dispose()` 时不涉及它；作用域仍为 `active`                                                                  | ⬜   |
| 13  | 手动调用 `acquire()` 返回的 disposer，底层清理抛错 | 捕获该错误后 `await scope.dispose()`                           | 错误原样抛给手动调用方；该条目在调用底层清理**之前**已摘除并标记已执行，**不回滚**回清单；`dispose()` 不重试它（避免已成功的那半被重复执行）           | ⬜   |
| 14  | 子作用域 S 独立 `dispose()` 时其内部 disposer 抛错 | 捕获后 `await parent.dispose()`                                | S 仍进入 `disposed` 并**已从父清单摘除**；父不再释放 S；父的其余条目正常释放                                                                           | ⬜   |
| 15  | 新增的公开导出                                     | 跑 `node scripts/audit/api-surface.mjs --check` 与 lint / test | 基线 [utils.json](../../api-baseline/utils.json) 已同步含新符号；TSDoc 齐全；`@aiao/utils` 四项覆盖率 ≥ **80%**（非核心包档位）                        | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> **AC 编号已于 2026-08-16 重排**（原 18 条 → 15 条，删去原 AC#7 / #14 / #15 三条
> `acquireAsync` 竞态用例）。原 AC#8→#7、#9→#8、#10→#9、#11→#10、#12→#11、#13→#12、#16→#13、
> #17→#14、#18→#15；AC#1～#6 不变。下游引用（[US-014 AC#17](US-014-plugin-scope-contract.md)）已同步。
>
> **2026-08-16 补入 AC#4b**（首次 `dispose()` 失败后的重复调用）。用 `4b` 而不是重排编号，
> 是为了不打断已经写进 US-014 与 spec 的下游引用。原 AC#4 的措辞「不抛错」在首次 reject 的场景下
> 与 AC#7 / AC#8 自相矛盾，补正口径见技术笔记 D3「幂等的准确含义」。
>
> 最容易漏的是 **AC#2（串行）**、**AC#9（子作用域按登记位置释放）** 与 **AC#13（失败的手动 disposer 不重试）**。
> 用 `Promise.all` 并发跑 disposer 能让 AC#1 的顺序断言在同步用例下侥幸通过，但会破坏因果：
> 「后登记的依赖先登记的」这一前提在异步释放时就不再成立。子作用域若统一提到最前或最后释放，
> 同样会让「父的资源在子还在用时就被撤销」重新变成可能。AC#13 的反面（失败后留在清单里等父重试）
> 看起来更「稳妥」，实际是让已经成功执行的那半清理被跑第二遍。

## 技术笔记

### 待冻结的三个决策

#### D1 — 命名（发布前唯一一次裁决）

原语管理的是**资源所有权与存活期**，不是响应式依赖追踪。用 `Effect` 命名会与两个一等目标框架的
同名不同义概念直接相撞。

| 方案                            | 主要风险                                                                                                                     | 结论        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `LifecycleScope` + `acquire()`  | `acquire` 对「把实体推进 `config.entities` 数组」这类**注册**型副作用略显勉强                                                | ✅ **推荐** |
| `ResourceScope` + `acquire()`   | 同上；且「resource」在 rxdb 里已被适配器/存储语境占用                                                                        | ❌          |
| 保留 `EffectScope` + `effect()` | 与 Vue 3.5 的 `EffectScope`/`effectScope()`、Angular 的 `effect()` 同名不同义；`rxdb-vue` 中一个文件同时 import 两者必然混淆 | ❌          |

方法名一并冻结：`acquire()` / `child()` / `dispose()`；
类型 `ScopeDisposer` / `AcquireResult`；错误 `LifecycleScopeDisposedError`。
`acquireAsync()` 这个名字**一并预留**（本故事不实现，见「已推迟」）：命名裁决只做一次，
将来补上异步版时不必再吵一轮，也不会出现 `acquire` / `acquireAsync` 分属两套命名风格。
「注册型副作用用 `acquire` 略勉强」这一残余代价被接受——它只影响读感，
而同名不同义会影响正确性。TSDoc 里把 `acquire` 的语义写成
「取得某种**所有权**（资源、注册项、监听器），并交回放弃它的方式」。

#### D2 — 原语放哪个包

| 方案                      | 主要风险                                                                                       | 结论        |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| `@aiao/utils`             | 扩大 utils 的定位（从「工具函数」到「运行时构件」）                                            | ✅ **推荐** |
| `@aiao/rxdb`              | `code-editor-*` 等非 rxdb 包用不到；`@aiao/utils` 反向依赖 `@aiao/rxdb` 不可接受，只能各写一份 | ❌          |
| 新建 `@aiao/lifecycle` 包 | 为 ~120 行新增第 30 个公开包，连带 build / 覆盖率 / 基线 / 文档五套配置                        | ❌          |

选 `@aiao/utils` 的实质理由不是「它是杂物箱」，而是**它已经在提供有生命周期的运行时构件**：
`async/AsyncQueueExecutor`、`@browser/leader-election`、`@browser/broadcast-channel-pool` 都不是纯函数，
都需要显式释放。加入 `LifecycleScope` 是补齐这一类的公共底座，不是定位漂移。

#### D3 — 多个 disposer 同时抛错时抛什么

| 方案                                | 主要风险                                                     | 结论        |
| ----------------------------------- | ------------------------------------------------------------ | ----------- |
| 只抛首个（同 `#runIsolated`）       | 丢失后续错误；多插件同时失败时只看得到一个                   | ❌          |
| 一律 `AggregateError`               | 单错场景下调用方要多剥一层，与既有 `#runIsolated` 手感不一致 | ❌          |
| 单错原样抛，多错聚合（AC#7 / AC#8） | 调用方需要 `instanceof AggregateError` 分支                  | ✅ **推荐** |

无论哪种方案，**不短路**是硬要求：一个 disposer 抛错绝不能让排在它后面的 disposer 被跳过——
这正是 [`RxDB.#runIsolated`](../../../packages/rxdb/src/RxDB.ts#L579-L593) 已经确立的口径，
本原语只是把它从「事务事件批量派发」推广到「作用域释放」。

配套的**摘除时机**由 AC#13 冻结：无论手动调用还是作用域释放，条目都在**执行底层清理之前**
就从清单摘除并标记已执行。失败不回滚、不重试——重试会让已经成功的那半清理被跑第二遍，
而「部分清理」正是最难排查的一类残留。

**幂等的准确含义（AC#4 / AC#4b，2026-08-16 补正）**：`dispose()` 把**首次调用产生的那个 Promise 实例
缓存下来**，后续调用一律返回同一个实例——**成功与失败一视同仁**。因此：

- 「幂等」= 副作用只发生一次 + 返回值恒等，**不等于**「第二次一定 resolve」。
  首次以 `AggregateError` reject 的作用域，第二次 `dispose()` 仍然 reject，且是**同一个错误对象**；
- 「不抛错」只约束**重复调用这件事本身不新增错误**：不会因为「已经释放过了」而报错，
  也不会重跑任何 disposer 去制造第二批错误。

反面写法（缓存一个 `disposed` 布尔、第二次直接 `return Promise.resolve()`）会把首次失败**吞掉**：
调用方在 `#shutdown()` 里对同一个作用域做防御性二次释放时，看到的是「一切正常」。

### 已推迟：`acquireAsync()` 与它的取消出口（2026-08-16 采纳）

结论的依据是逐个核过 US-013 → US-017 链条上**全部四个**迁移点的资源获取方式（每一行都可点开复验）：

| 迁移点                | 资源获取                                                       | 是否跨 await |
| --------------------- | -------------------------------------------------------------- | ------------ |
| `RxDBPluginGraph`     | 属性赋值 + 注册                                                | 否           |
| `RxDBPluginStorage`   | `new RxdbFileStorage(...)` + `Object.defineProperty`           | 否           |
| `RxDBPluginWorkspace` | `createWorkspaceStore()`（[workspace-store.ts:47] 是同步函数） | 否           |
| `RxDBPluginSearch`    | `subscribe()` / `addEventListener`                             | 否           |

[workspace-store.ts:47]: ../../../packages/rxdb-plugin-workspace/src/workspace-store.ts#L47

**结论**：`acquireAsync()` + `AbortSignal` 在本 Epic 全链条内**零调用方**。它是纯可加性 API——
将来任何一个调用方出现时补上，对已发布的 `acquire()` / `child()` / `dispose()` 零影响。
而保留它的代价是两个决策 + 三条最难写的异步竞态用例。按 Epic 的「病灶数 ≥ 抽象数」判据，
**已于 2026-08-16 摘除**：删去原 AC#7 / AC#14 / AC#15，本故事只交付同步 `acquire()`。

#### 重新加回来的触发条件

出现下列任一情况即补上，并同时恢复本节的两个决策与三条 AC（**不要**只加方法不加竞态测试）：

- 某个调用方必须写成 `const res = await open(); scope.acquire(…)`——`await` 期间作用域可能已释放，
  同步 `acquire()` 会抛 `LifecycleScopeDisposedError`（AC#5）而 `res` 已打开且无人关闭
- 最可能的第一个调用方是 `US-016` 的**适配器作用域**：`await adapter.connect()` 之后再登记
  `() => adapter.disconnect()`，正好落在上面这个形状里。该故事**价值已证、待切片**、尚未创建，
  因此现在不为它冻结语义——**为假想调用方冻结的竞态语义，等真实调用方出现时往往不合用**

#### 已选定的形状（推迟不等于没想清楚，补回来时照此实现）

```ts
scope.acquireAsync(async signal => {
  const resource = await open({ signal });
  return () => resource.close();
}, 'label');
```

- **独立方法而非重载 `acquire()`**：同一个方法两套语义会逼同步路径也返回 Promise，
  而同步登记是最常见的用法。分工判据「资源获取是否跨 `await`」直接写进 TSDoc
- **竞态出口**：await setup → 若作用域已非 `active`，立刻执行并等待拿到的 disposer，然后 reject。
  这次迟到的清理**必须并入当次 `dispose()` 的等待集合**，否则 `dispose()` 会在资源真正关闭之前
  resolve，测试就抓不到泄漏
- **取消出口**：释放时序固定为 **abort → 等待 setup settle → 处置迟到的 disposer**。
  不内置超时强制推进——「超时后资源到底关没关」不可知，那会把确定性原语变成靠时间赌的原语；
  上游不支持取消时退化为等待语义
- setup 若在 abort 后 reject，该错误归 `acquireAsync` 的调用方，**不**并入 `dispose()` 的错误集合——
  没有成功获取的资源就没有需要释放的东西

#### 其余后续可加（本故事不交付）

- 长异步栈追踪、全局作用域注册表、超时强制释放（见 Out of Scope）

### 参考实现

cordis 的 `Fiber.effect()`（`packages/core/src/fiber.ts`）是同类原语的成熟实现，其
**收集 / 逆序 / 异步等待 / 嵌套** 四项语义可以直接借鉴。**不要**连带引入它的另外三样东西：

- `FiberState` 六态与 epoch 重激活——那是插件加载态，属 US-014 / US-015 系列的范围
- `getTraceable` 的 Proxy 追踪——rxdb 已有 `EntityProxy` 一层代理，再叠一层会让栈与调试同时变糟
- `composeError` / `buildOuterStack` 长栈——可独立交付的诊断增强，不在本故事

同样**不要**把 cordis 作为运行时依赖引入：它是 0.x 且自述 API 未稳定，而 rxdb 要发 29 个公开包。

### 实现约束

- 零外部依赖（不引入 `cosmokit` 等）；不使用 `WeakRef` / `FinalizationRegistry`
- 清单用「自增序号 → 条目」的 `Map` 而非数组：`acquire()` 返回的 disposer 需要 O(1) 摘除自身（AC#3），
  数组的 `indexOf` + `splice` 在大量短生命周期条目下是 O(n²)
- 逆序释放取「清空清单再反转」，避免释放过程中的清单变动影响迭代
- `setup` 的类型只接受**同步**返回（`ScopeDisposer | undefined`，不是 `Promise<…>`）：
  这样「资源获取跨 `await`」的调用方会在**编译期**被挡下，而不是运行时静默泄漏。
  将来加 `acquireAsync()` 时是新增重载，不改这条
- `label` 只用于诊断与错误消息，不参与身份，允许重复；缺省值 `'anonymous'`
- `dispose()` 的返回值存进一个字段并原样复用（`#disposePromise ??= this.#runDispose()`），
  **不要**在 catch 里把它换成一个已 resolve 的 Promise——那会让 AC#4b 的「同一个错误对象」失效
- 估算：实现约 120 行，测试约 260 行（16 条 AC 每条至少一个用例，AC#2 / AC#7 / AC#9 各需 2～3 个）

## 实现文件

- `packages/utils/src/lifecycle/lifecycle-scope.ts` — `LifecycleScope` 类与三态状态机
- `packages/utils/src/lifecycle/lifecycle-scope.interface.ts` — `ScopeDisposer` / `AcquireResult` / `LifecycleScopeDisposedError`
- `packages/utils/src/lifecycle/index.ts` — 子目录桶导出
- `packages/utils/src/index.ts` — 主入口追加 `export * from './lifecycle/index.js'` 与 fileoverview 条目
- `packages/utils/src/__tests__/lifecycle/lifecycle-scope.spec.ts` — 语义冻结测试
- `requirements/api-baseline/utils.json` — 新导出符号的基线（`node scripts/audit/api-surface.mjs --update`）

## References

- [epic-008 生命周期作用域](../../epics/epic-008-lifecycle-scope.md) — 九处手工配对的清单与代价
- [US-014 插件作用域契约](US-014-plugin-scope-contract.md) — 本原语的第一个调用方
- [`RxDB.#runIsolated`](../../../packages/rxdb/src/RxDB.ts#L579-L593) — 「不短路 + 首错重抛」的既有口径
- [versioning-policy.md](../../versioning-policy.md) 第 4 节 — API 表面基线工作流
- cordis `packages/core/src/fiber.ts` — 参考实现（不作为依赖引入）
