---
id: epic-008-lifecycle-scope
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 生命周期作用域

## 愿景

让「一段代码活多久」成为**可声明、可组合、可验证**的东西。

今天 rxdb 里每一个会产生副作用的构件——插件、网关、事件监听器、订阅、实例级属性注入——都各自维护
一份「安装时做了什么 → 拆卸时逐一撤销」的手工账本。账本是自由格式的，编译器不检查，测试也很难覆盖，
唯一的保证是作者当时记得写对称的那一半。本 Epic 要把这份账本收敛成**一个原语**：登记副作用时就同时
登记它的撤销方式，作用域结束时逆序自动释放。

目标状态是：新增一个副作用**没有地方**可以忘记写它的清理；已有的九处手工配对逐步迁移到同一套语义上。

## 为什么单列一个 Epic

现有七个 Epic 里，epic-001~006 按**产品能力**分组（核心引擎、同步、UI、未来能力、类型系统、工作树），
[epic-007](epic-007-public-api-gates.md) 按**发布约束**分组。生命周期作用域两者都不是：

- 它不是用户可见能力——应用开发者不会因为它多出一个功能，挂进 epic-001 会让「核心 MVP」的愿景失真；
- 它也不是门禁——epic-007 的收口判据是「某道门禁的覆盖面小于它被引用时暗示的范围」，
  而本 Epic 处理的是**运行时契约缺失**，不是扫描器覆盖面。

它是一层**横切的实现约束**：一旦落地，后续每一个插件、每一个框架绑定、每一个 DevTools 探针都受它约束。
这类工作需要一个能长期承接的归属，而不是每次现补一个「重构」故事。

新缺口进入本 Epic 的判据只有一条：**它是「资源的获取与释放被拆成两处、靠人工保持对称」的问题**。
「某个功能还没做」不属于本 Epic，哪怕它顺带要清理几个订阅。

## 现状：同一件事被手工写了九遍

以下九处都在做同一件事——记录「装了什么」以便「拆的时候撤销」——但没有两处的写法相同：

| #   | 位置                                                                                               | 手工机制                                                                       | 已知代价                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [RxDB.ts:605-621](../../packages/rxdb/src/RxDB.ts#L605-L621) `#shutdown()`                         | 一次手工复位 8 处状态                                                          | 注释自陈「复位是拆卸的一半」；漏一处 = 重连后拿到空壳实例                                                                                                                            |
| 2   | [RxDB.ts:142](../../packages/rxdb/src/RxDB.ts#L142) `#event_initialized`                           | 「只装一次」布尔守卫                                                           | 事件监听器**没有**卸载路径，只能靠不重复装来防泄漏                                                                                                                                   |
| 3   | [RxDB.ts:118](../../packages/rxdb/src/RxDB.ts#L118) `#plugin_install_promises`                     | `Map<IRxDBPlugin, Promise<void>>` 记账 + 失败后删条目允许重试                  | 安装态、失败态、重试态三件事挤在一个 Map 里                                                                                                                                          |
| 4   | [storage/plugin.ts:19-20](../../packages/rxdb-plugin-storage/src/plugin.ts#L19-L20)                | `#ownsStorage` + `#registeredEntity` 双布尔                                    | `defineProperty` / `deleteProperty` 与 `entities.push` / `splice` 两对配对散在 install / destroy                                                                                     |
| 5   | [search/plugin.ts:84,98-100](../../packages/rxdb-plugin-search/src/plugin.ts#L84)                  | `SearchPluginPhase` 五态枚举 + `#installPromise` 身份比对                      | 为了处理「destroy 与异步 install 竞态」自建了一套状态机                                                                                                                              |
| 6   | [search/plugin.ts:109,479-480](../../packages/rxdb-plugin-search/src/plugin.ts#L109)               | `Array<{type, listener}>` 手工监听器清单，destroy 时逐个 `removeEventListener` | 新增一处 `addEventListener` 必须记得 push 进同一个数组                                                                                                                               |
| 7   | [workspace:173-174,196](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L173-L174) | `#installPromise` + `#installFailed` + `#destroyed` 三标志                     | 第三套语义不同的安装状态机；`#destroyed` 需要在每个 `await` 之后重新检查                                                                                                             |
| 8   | [workspace:185,412-425](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L185)      | `Map<CacheId, Subscription>` + 独立的 `#taskSubscription`                      | 两处订阅两套释放路径；`rollback(() => …)`（:295）已经是本原语的临时手写版                                                                                                            |
| 9   | [graph/plugin.ts:33-35](../../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35)                    | `destroy()` 空实现，注释只写「注销」                                           | **契约里没有位置可写**：`install()` 调 `rxdb.repository()` 写进 `#repository_config_map`，而 RxDB 全文只有 `.set`（:310）与 `.get`（:391），**没有反注册 API**——这不是忘写，是写不了 |

第 9 条是本 Epic 的直接触发点：它证明「靠自觉写对称的 destroy」在当前契约下**做不到**，
因为宿主根本没提供撤销入口。补一个 `unregisterRepository()` 只能解决这一处；同样的洞会在
下一个「注册型」能力上原样重现。

### 两处「拆了装不回来」的既有泄漏

第 4 / 第 7 条不只是写法不统一，它们**今天就会产生用户可见的坏结果**——因为插件实例由
[`#plugin_map`](../../packages/rxdb/src/RxDB.ts#L338-L349) 缓存、**构造器只跑一次**，而 `destroy()`
每次停机都跑：

- **storage**：`new RxdbFileStorage(...)` 与 `Object.defineProperty(rxdb, 'storage', …)` 都在
  [构造器:27-41](../../packages/rxdb-plugin-storage/src/plugin.ts#L27-L41)，`destroy()` 却
  `Reflect.deleteProperty(this.rxdb, 'storage')`（:53-64）。**断连一次之后 `rxdb.storage` 永久消失**，
  重连不会把它装回来。且 [storage.service.ts:822-832](../../packages/rxdb-plugin-storage/src/storage.service.ts#L822-L832)
  的 `destroy()` 是终态，同一个实例即便留着也已经 `StorageDestroyedError`。
- **workspace**：`#destroyed`（:196）是终态标志，从不复位；`#indexedDBStore` 是
  `readonly` + definite assignment（:169），构造器之后无法重新赋值。拆卸后同样装不回来。

**这两条 + 第 9 条构成 US-014 的全部必要性**：它们不依赖依赖图、连接纪元或框架宿主，
US-014 独立交付即可关闭。后续故事必须各自证明自己的症状。

### 一处贯穿全部九项的不对称

[RxDB.ts:765-775](../../packages/rxdb/src/RxDB.ts#L765-L775) 的 `#destroy_plugin()` 用 `Promise.all`
并发调用，把每个插件 `destroy()` 的异常 `console.error` 后**吞掉**；而
`#track_plugin_install()`（:714-728）会把 `install()` 的异常经 `#await_plugin_installs()` 抛给 `connect()`。
同一个生命周期的两端，一端硬失败一端静默，且拆卸端连**逆序**都没有——
这不是某个插件的 bug，是「拆卸没有统一语义」的直接后果。

## 2026-08-16 Cordis 第二轮复核

再次对照 `/Users/jimmy/Documents/aiao/cordis` 的 `Fiber`、`EventsService`、`Service.check`、反射通知和对应测试后，
真正值得迁移的不是 Cordis 的 `Context`、Proxy 或完整状态枚举，而是三条可验证的机制：

1. **目标纪元（target epoch）+ 单飞 reconcile。** Cordis 的 `_setEpoch()` 在过渡进行时只更新目标，不并发启动第二个
   `_reload()` / `_unload()`；当前过渡结束后再比较最新目标。迁移到 RxDB 后，同一插件同一时刻最多一个
   `install` / 作用域释放过渡：
   - `install()` 尚未 settle 时依赖消失，必须等它 settle，释放已经登记的 scope，且不能把旧 epoch 标成 `active`；
   - `disposing` 期间出现新 epoch，旧释放只执行一次，完成后直接安装最新 epoch，不启动中间纪元；
   - 安装失败绑定到触发它的依赖 epoch，依赖不变时不自动重试，只有新 epoch 才重新 reconcile。
2. **就绪判定与失效通知分开。** Cordis 用 `Service.check` 判断注入对象当前是否可用，再由反射通知触发依赖重新评估；RxDB
   应把 `adapterConnected$(adapterName)` 当作“当前表结构已就绪”的谓词信号，把 adapter 实例身份编码进
   `targetEpoch`。信号变为 `false` 或实例替换只负责触发 reconcile，不负责直接操作插件状态；这样不会重新退化成
   `firstValueFrom(connected$)` 的聚合猜测，也不会把 Observable 误当成依赖容器。
3. **注册即返回 disposer。** Cordis `EventsService.on()` 返回幂等 disposer，并把监听器挂进当前 Fiber 的 effect；RxDB
   现有 `addEventListener()`、VersionManager、HistoryManager、QueryManager、Gateway、Search、Workspace 仍维护多份
   手工 remover/subscription 清单。`LifecycleScope` 迁移应让事件注册返回幂等 remover，再用 `scope.acquire()` 统一登记，
   保留现有 `removeEventListener()` 作为兼容路径。

   `@aiao/utils` 的 `EventDispatcher` 使用 `Set` 去重，因此同一 listener 的重复注册仍只有一个集合条目；重复调用返回
   的 disposer 应为幂等空操作，只有实际插入条目的 disposer 负责移除它。这样既保留现有去重语义，也不会误删另一处注册。
   该 API 收敛属于本 Epic 的生命周期账本，不另起 Cordis 兼容层。

对应测试必须覆盖 Cordis `fiber.spec.ts` 的三类 inertia lock：安装中断连、安装/释放期间重新连上、依赖实例替换但名字不变；
并覆盖 `dispose.spec.ts` 的重复释放、逆序、嵌套和异步释放。**不迁移** Cordis `Context`/`provide()`、Proxy trace、全局
Registry、thenable Fiber、HMR 或长异步栈追踪。

## 目标

已认领，构成本 Epic 的承诺范围：

- [ ] 在 `@aiao/utils` 提供 `LifecycleScope` 生命周期作用域原语，语义（逆序、幂等、**异步释放**、错误隔离、可嵌套）
      由测试冻结（[US-013](../stories/core/US-013-lifecycle-scope-primitive.md)）。
      **异步获取**（`acquireAsync()` + `AbortSignal`）不在承诺范围：本 Epic 四个迁移点的资源获取全部是同步的，
      零调用方，已于 2026-08-16 推迟；它是纯可加性 API，出现第一个「获取跨 `await`」的调用方时再补
- [ ] `IRxDBPlugin` 契约改为 `install(scope)`，四个插件包全部迁移，`destroy()` 转为可选并进入废弃周期；
      **关闭上表第 4 / 7 / 9 条三处既有泄漏**（[US-014](../stories/core/US-014-plugin-scope-contract.md)）

已冻结契约，分两阶段交付：

- [ ] 插件可声明 `inject` 依赖，依赖未就绪时不安装、依赖消失时自动释放作用域
      （[US-015](../stories/core/US-015-plugin-inject-dependency.md)）。
      **阶段 A** 适配器依赖纪元——症状已证（search 插件的 `adapterConnected$` 等待与 phase 机），US-014 后可直接排期；
      **阶段 B** 插件间依赖图（拓扑序、环检测）——**价值待证**，未证不开工

价值已证，尚未切片：

- [ ] `RxDB.#shutdown()` 的手工复位收敛到实例作用域（背景见「现状」表第 1 项）——预留给 `US-016`。
      当前 `init()` 在 `versionManager.init()` 或 Gateway 初始化失败时只复位 `#rxdb_initialized`，没有销毁已登记的
      VersionManager 事件和 RxJS subscription；下一次 `init()` 会重复注册副作用。US-016 至少要覆盖 init 失败回滚、
      `disconnectAll()` 统一释放，以及事件 disposer API。
- [ ] 三框架绑定（Angular `DestroyRef` / React `useEffect` cleanup / Vue `onScopeDispose`）统一挂接到
      同一个作用域原语——预留给 `US-017`

> 后两组已被 US-014 / US-015 的正文引用为 `US-016` / `US-017` 的归属，但**故事文件尚未创建**，
> 因此它们仍不是排期承诺；但 US-016 已有可复现症状，不再是「价值待证」。US-014 交付后本 Epic 的三处已知泄漏即全部关闭；
> 015a 之后的每一条仍必须在自己的故事里写出「今天用户踩得到的具体症状」才允许开工。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-013 LifecycleScope 生命周期作用域原语](../stories/core/US-013-lifecycle-scope-primitive.md) (High)
- [US-014 插件作用域契约](../stories/core/US-014-plugin-scope-contract.md) (High)
- 📄 [US-015 插件依赖声明与按需装卸](../stories/core/US-015-plugin-inject-dependency.md) (Medium) — 父契约故事，不直接交付
  - `US-015a` 适配器依赖纪元 — 文件未创建
  - `US-015b` 插件依赖图 — 文件未创建，价值待证
- `US-016` 连接纪元与停机收敛 — 文件未创建，价值已证，待切片
- `US-017` 三框架宿主作用域 — 文件未创建，价值待证

**US-013 → US-014 是硬序**，不可交换：US-014 的 `install(scope)` 签名需要 US-013 冻结的
`LifecycleScope` 类型。US-014 之后的顺序（015a → 015b → 016 → 017）是**依赖顺序，不是排期承诺**——
US-015 的「依赖消失时释放」确实需要 US-014 先把插件副作用收进作用域，但「需要 A 先做」
不等于「B 一定要做」。

## 非目标

- **不引入依赖注入容器**。`inject` 的取值限定在一组**封闭的依赖类别**——本地/远端适配器，以及
  `plugin:${已安装插件名}`——而不是任意字符串键。（它在类型上是模板字面量类型，不是 TS `enum`；
  「封闭」指的是类别封闭，不是取值可枚举。）不提供 `ctx.provide()` 式的动态服务注册表。
  要扩大类别必须另起故事并说明理由。
- **不引入 Proxy 追踪**。rxdb 已经有 `EntityProxy` 一层代理，再叠一层「谁在调用我」的 traceable 代理
  会让栈和调试同时变糟。作用域的归属靠**显式传参**（`install(scope)`），不靠调用方推断。
- **不做长异步栈追踪**。「effect 出错时指回 `scope.effect()` 的调用点」是可独立交付的诊断增强，
  与本 Epic 的正确性目标正交，留给后续故事。
- **不做词法多实例隔离**。[entity-manager.ts:537-580](../../packages/rxdb/src/entity/entity-manager.ts#L537-L580)
  的 `resolveEntityManager` 多实例抛错 + 全局动态栈是另一个问题（作用域的**可见性**，不是**存活期**），
  不在本 Epic 内解决。
- **不改 `RxDB` 的公开生命周期方法**。`init()` / `connect()` / `disconnect()` 的对外签名与语义不变；
  本 Epic 只改插件侧契约与内部记账方式。
- **不做 DevTools 的作用域可视化**。需要先有稳定的作用域树才谈得上展示，排在三个故事之后。

## 与既有 Epic 的边界

| 相邻 Epic                                              | 边界                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [epic-001 核心 MVP](epic-001-core-mvp.md)              | 001 交付的是**能力**（查询、变更、事务）；本 Epic 不新增任何能力，只改这些能力的装卸方式                                                                                                                                                        |
| [epic-007 公开 API 门禁](epic-007-public-api-gates.md) | 007 管「导出表面被增删改能否被门禁发现」；本 Epic 会**制造**一次这样的变更（`IRxDBPlugin` 成员改动），并暴露一个已知盲区：`api-surface.mjs` 只记录 `{name, kind}`，成员签名变化不触发 diff。该盲区由 US-014 用类型契约测试补，不扩大 007 的范围 |
| [epic-006 工作树](epic-006-working-tree-commits.md)    | 006 的恢复会话/物化暂存有自己的持久化生命周期，不复用本 Epic 的**进程内**作用域；两者不互为前置                                                                                                                                                 |
