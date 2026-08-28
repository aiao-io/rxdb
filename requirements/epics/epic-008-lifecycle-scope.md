---
id: epic-008-lifecycle-scope
status: Done
startDate: 2026-08-15
targetDate: TBD
owner: jimmy
---

# 生命周期作用域

## 愿景

让「一段代码活多久」成为**可声明、可组合、可验证**的东西。

改造前 rxdb 里每一个会产生副作用的构件——插件、网关、事件监听器、订阅、实例级属性注入——都各自维护
一份「安装时做了什么 → 拆卸时逐一撤销」的手工账本。账本是自由格式的，编译器不检查，测试也很难覆盖，
唯一的保证是作者当时记得写对称的那一半。本 Epic 把这份账本收敛成**一个原语**：登记副作用时就同时
登记它的撤销方式，作用域结束时逆序自动释放。

目标状态是：新增一个副作用**没有地方**可以忘记写它的清理。

## 为什么单列一个 Epic

epic-001~006 按**产品能力**分组（核心引擎、同步、UI、未来能力、类型系统、工作树），
[epic-007](epic-007-public-api-gates.md) 按**发布约束**分组。生命周期作用域两者都不是：

- 它不是用户可见能力——应用开发者不会因为它多出一个功能，挂进 epic-001 会让「核心 MVP」的愿景失真；
- 它也不是门禁——epic-007 的收口判据是「某道门禁的覆盖面小于它被引用时暗示的范围」，
  而本 Epic 处理的是**运行时契约缺失**，不是扫描器覆盖面。

它是一层**横切的实现约束**：一旦落地，后续每一个插件、每一个框架绑定、每一个 DevTools 探针都受它约束。

## 目标

三条都是可核对的状态，不是产品指标：

- [x] `@aiao/utils` 有一个语义被测试冻结的作用域原语，**登记副作用与登记它的撤销写在同一个闭包里**；
- [x] 插件契约不再有「装了什么」的自由格式账本——四个插件包的安装态全部经 `install(scope)` 登记；
- [x] 宿主自己持有的资源（`versionManager` / `#gateway` / `entityManager`）在**成功停机与失败回滚两条路径上对称释放**。

## 收口判据

本 Epic 在下列两条同时成立时置 `Done`：

1. 「九处手工账本」结算表没有 `未关闭` 行；
2. 承诺范围内的故事 YAML `status` 均不为 `In Progress`。

当前距离：**零，已置 `Done`**。结算表第 1 条随失败回滚的资源三步补齐关闭；
[US-015](../stories/core/US-015-plugin-inject-dependency.md) 停在 `In Review`（阶段 B 已移出承诺范围），
`In Review` 不是 `In Progress`，不挡第 2 条。

新缺口进入本 Epic 的判据，两条**同时**满足：

- 它是「资源的获取与释放被拆成两处、靠人工保持对称」的问题；
- 它能写出**今天用户踩得到的具体症状**（[病灶数 ≥ 抽象数](../CONVENTIONS.md#价值待证--价值待证)）。

两类东西明确不属于本 Epic，即使它们出现在同一个方法里：

- **「某个功能还没做」**——哪怕它顺带要清理几个订阅；
- **「状态变量需要复位」**——作用域原语管的是资源释放，不是状态复位。
  `RxDB.#shutdown()` 里 `#transaction_stack = []`、`#connected_sub.next(false)` 这类复位
  原语按定义碰不到；把它们算进病灶数会架空上面第二条判据。

## 结算：九处手工账本

改造前九处都在做同一件事——记录「装了什么」以便「拆的时候撤销」——但没有两处的写法相同。当前状态：

| #   | 病灶                                                             | 结算                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `RxDB.#shutdown()` 手工复位                                      | 关闭（bugfix）——`init()` 失败回滚补齐 `versionManager.destroy()` + `#gateway?.destroy()` + `entityManager.destroy()`，与 `#shutdown()` 的资源三步对称                                                                                                                                                          |
| 2   | `RxDB.#event_initialized` 布尔守卫                               | **改判：不是病灶**——布尔守卫防的是重连时重复注册导致监听器集合膨胀，实例被回收时监听器一并消失，不占本 Epic 名额                                                                                                                                                                                               |
| 3   | `RxDB.#plugin_install_promises` 安装记账 Map                     | 关闭（US-015 阶段 A）——字段已删，安装态迁进 `PluginDependencyScheduler`                                                                                                                                                                                                                                        |
| 4   | storage 的 `#ownsStorage` / `#registeredEntity` 双布尔           | 关闭（US-014）——`RxDBPluginStorage.install(scope)` 三段 `scope.acquire()`，标签 `storage:service` / `storage:property` / `storage:entity`（[plugin.ts](../../packages/rxdb-plugin-storage/src/plugin.ts)）                                                                                                     |
| 5   | search 的 `SearchPluginPhase` 五态枚举                           | 关闭（US-015 阶段 A）——枚举已删，`installing` / `failed` 由调度器持有                                                                                                                                                                                                                                          |
| 6   | search 的 `Array<{type, listener}>` 手工监听器清单               | 关闭（US-014）——一条监听一条 `scope.acquire()`，注册与撤销同处一个闭包                                                                                                                                                                                                                                         |
| 7   | workspace 的 `#installPromise` / `#installFailed` / `#destroyed` | 关闭（US-014）——终态标志 `#destroyed` 已删（判据改成 `#indexedDBStore` 随纪元生灭），插件实例可重新 `install()` 进入新纪元。`#installPromise` / `#installFailed` **仍在**：它们是纪元内 IndexedDB 恢复的单飞与失败重试记账，由 `#releaseEpochState()` 复位，不是终态泄漏；US-015 Out of Scope 明确两阶段都不动 |
| 8   | workspace 的 `Map<CacheId, Subscription>`                        | 关闭（US-014）——纪元级释放经 `RxDBPluginWorkspace.#acquireEpoch()` 的 `scope.acquire(..., 'workspace:epoch')` 登记（[RxDBPluginWorkspace.ts](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts)）；Map 本身是纪元内的动态缓存，不是「拆成两处的配对」                                            |
| 9   | graph 的 `destroy()` 空实现——**契约里没有位置可写**              | 关闭（US-014）——`RxDB.repository()` 收 `scope` 形参，`RxDBPluginGraph.install(scope)` 把注册挂上去（[plugin.ts](../../packages/rxdb-plugin-graph/src/plugin.ts)）                                                                                                                                              |

改造前贯穿全部九项的那处不对称——`RxDB.#destroy_plugin()` 用 `Promise.all` 并发拆卸、吞掉异常、且没有逆序
——也已随 US-014 关闭：现在是逆序串行 + 错误隔离不短路
（[`RxDB.#destroy_plugin()`](../../packages/rxdb/src/RxDB.ts)）。

## 承诺范围

已交付：

- [x] `@aiao/utils` 提供 `LifecycleScope` 原语，语义（逆序、幂等、**异步释放**、错误隔离、可嵌套）
      由测试冻结（[US-013](../stories/core/US-013-lifecycle-scope-primitive.md)）。260 行实现 / 600 行测试。
      **异步获取**（`acquireAsync()` + `AbortSignal`）不在承诺范围：四个迁移点的资源获取全部同步，零调用方；
      它是纯可加性 API，出现第一个「获取跨 `await`」的调用方时再补
- [x] `IRxDBPlugin` 契约改为 `install(scope)`，四个插件包全部迁移，`destroy()` 转为可选并进入废弃周期；
      **关闭结算表第 4 / 6 / 7 / 8 / 9 条**（[US-014](../stories/core/US-014-plugin-scope-contract.md)）
- [x] 插件可声明 `inject` 依赖，依赖未就绪时不安装、依赖消失时自动释放作用域——**阶段 A 适配器依赖纪元**
      （[US-015](../stories/core/US-015-plugin-inject-dependency.md)，2026-08-21）：`inject: ['adapter:local']`、
      `PluginDependencyScheduler` 与 `localAdapterSync`；**关闭结算表第 3 / 5 条**

- [x] `init()` 失败回滚补齐与 `#shutdown()` 对称的资源三步（`versionManager` / `#gateway` / `entityManager`
      的 `destroy()`）——bugfix，不单开故事（见结算表第 1 条）

未交付：无。

## 已移出承诺范围

三条曾被本 Epic 引用为后续故事，按收口判据改判。它们不是排期承诺，写明解锁条件后**未解锁不开工**：

| 条目                        | 改判理由                                                                                                                                                                                                                         | 解锁条件                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| US-015 阶段 B 插件间依赖图  | **零消费方**：全仓库唯一的 `inject` 声明是 search 的 `readonly inject = ['adapter:local']`。拓扑序与环检测是为一个不存在的依赖图准备的                                                                                           | 出现第一个 `plugin:*` 依赖声明 |
| `US-016` 连接纪元与停机收敛 | 原始症状（`init()` 失败只复位 `#rxdb_initialized`）已随阶段 A 大部分修复；剩余部分降级为上方 bugfix。收益上限是「14 步变 11 步」，达不到一条故事的门槛                                                                           | 不再解锁——已被 bugfix 取代     |
| `US-017` 三框架宿主作用域   | 三端各自已有原生作用域并且在用：Angular `DestroyRef`、React `useEffect` cleanup、Vue `onScopeDispose`。抽第四层需要先有三端各自的泄漏证据，目前一条没有。**铁律「三框架对称」约束的是对外 API 对称，不是内部实现共用同一个原语** | 三端任一出现可复现的清理泄漏   |

## 设计依据：从 Cordis 迁移了什么

对照 `../../../cordis` 的 `Fiber`、`EventsService`、`Service.check`、反射通知与
`registry.ts` / `utils.ts`，迁移的不是 Cordis 的 `Context`、Proxy 或完整状态枚举，而是五条可验证的机制：

| 机制                                                                   | 落点                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **目标纪元 + 单飞 reconcile**——过渡进行时只更新目标，不并发启动第二次  | `PluginDependencyScheduler`（US-015 阶段 A）                                     |
| **就绪判定与失效通知分开**——`adapterConnected$` 作谓词，实例身份进纪元 | 同上；因此不会退化成 `firstValueFrom(connected$)` 的聚合猜测                     |
| **作用域树是本地读出，不是全局注册表**                                 | `LifecycleScope.getEntries()`（US-013 AC#9b）                                    |
| **一次 `acquire()` 只包一步会失败的获取**                              | US-013 AC#12b；storage 迁移据此写成三段式，`defineProperty` 抛错时新实例不进清单 |
| **批量 reconcile + 只在 `active` 边上通知**                            | 调度器的两条并发测试                                                             |

测试覆盖 Cordis `fiber.spec.ts` 的三类 inertia lock（安装中断连、安装/释放期间重新连上、依赖实例替换但名字不变）
与 `dispose.spec.ts` 的重复释放、逆序、嵌套、异步释放。

**已否决，不再评估**：

- Cordis `Context` / `provide()` / Proxy trace、全局 Registry、thenable Fiber、HMR、长异步栈追踪；
- `packages/timer` 的 `ctx.timeout()` / `interval()` / `throttle()` / `debounce()`：rxdb 的 ~30 处 `setTimeout`
  全部在适配器内部，已有 47 处配对的 `clear*`，且适配器自己拥有 `destroy()`——不满足「病灶数 ≥ 抽象数」；
- **`addEventListener()` 返回幂等 disposer**：Cordis 用它保证注册与撤销同处一点，rxdb 用
  `scope.acquire(() => { add; return () => remove; })` 拿到了同一个保证。`RxDB.addEventListener()` 保持返回
  `void`，改签名只是人体工学收益，背后没有症状。

## 非目标

- **不引入依赖注入容器**。`inject` 的取值限定在一组**封闭的依赖类别**——本地/远端适配器，以及
  `plugin:${已安装插件名}`——而不是任意字符串键。（它在类型上是模板字面量类型，不是 TS `enum`；
  「封闭」指的是类别封闭，不是取值可枚举。）不提供 `ctx.provide()` 式的动态服务注册表。
  要扩大类别必须另起故事并说明理由。
- **不引入 Proxy 追踪**。rxdb 已经有 `EntityProxy` 一层代理，再叠一层「谁在调用我」的 traceable 代理
  会让栈和调试同时变糟。作用域的归属靠**显式传参**（`install(scope)`），不靠调用方推断。
- **不做长异步栈追踪**。「effect 出错时指回 `scope.effect()` 的调用点」是可独立交付的诊断增强，
  与本 Epic 的正确性目标正交。
- **不做词法多实例隔离**。`resolveEntityManager` 的多实例抛错 + 全局动态栈是另一个问题
  （作用域的**可见性**，不是**存活期**），不在本 Epic 内解决。
- **不改 `RxDB` 的公开生命周期方法**。`init()` / `connect()` / `disconnect()` 的对外签名与语义不变。
- **不做 DevTools 的作用域可视化**。数据源（`getEntries()`）已就位，展示层排在本 Epic 之外。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-013 LifecycleScope 生命周期作用域原语](../stories/core/US-013-lifecycle-scope-primitive.md) (High)
- [US-014 插件作用域契约](../stories/core/US-014-plugin-scope-contract.md) (High)
- [US-015 插件依赖声明与按需装卸](../stories/core/US-015-plugin-inject-dependency.md) (Medium) — 阶段 A 已交付，阶段 B 已移出

**US-013 → US-014 是硬序**，不可交换：US-014 的 `install(scope)` 签名需要 US-013 冻结的 `LifecycleScope` 类型。
两条均已交付，硬序解除。

## 与既有 Epic 的边界

| 相邻 Epic                                              | 边界                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [epic-001 核心 MVP](epic-001-core-mvp.md)              | 001 交付的是**能力**（查询、变更、事务）；本 Epic 不新增任何能力，只改这些能力的装卸方式                                                                                                                                                                |
| [epic-007 公开 API 门禁](epic-007-public-api-gates.md) | 007 管「导出表面被增删改能否被门禁发现」；本 Epic 已**制造**一次这样的变更（`IRxDBPlugin` 成员改动），并暴露一个已知盲区：`api-surface.mjs` 只记录 `{name, kind}`，成员签名变化不触发 diff。该盲区已由 US-014 的类型契约测试就地补上，未扩大 007 的范围 |
| [epic-006 工作树](epic-006-working-tree-commits.md)    | 006 的恢复会话/物化预取有自己的持久化生命周期，不复用本 Epic 的**进程内**作用域；两者不互为前置                                                                                                                                                         |
