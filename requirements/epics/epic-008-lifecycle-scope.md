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

| #   | 位置                                                                                                | 手工机制                                                                    | 已知代价                                                                                        |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | [RxDB.ts:597-613](../../packages/rxdb/src/RxDB.ts#L597-L613) `#shutdown()`                          | 一次手工复位 8 处状态                                                       | 注释自陈「复位是拆卸的一半」；漏一处 = 重连后拿到空壳实例                                        |
| 2   | [RxDB.ts:142](../../packages/rxdb/src/RxDB.ts#L142) `#event_initialized`                            | 「只装一次」布尔守卫                                                        | 事件监听器**没有**卸载路径，只能靠不重复装来防泄漏                                               |
| 3   | [RxDB.ts:118](../../packages/rxdb/src/RxDB.ts#L118) `#plugin_install_promises`                      | `Map<IRxDBPlugin, Promise<void>>` 记账 + 失败后删条目允许重试                | 安装态、失败态、重试态三件事挤在一个 Map 里                                                     |
| 4   | [storage/plugin.ts:19-20](../../packages/rxdb-plugin-storage/src/plugin.ts#L19-L20)                 | `#ownsStorage` + `#registeredEntity` 双布尔                                 | `defineProperty` / `deleteProperty` 与 `entities.push` / `splice` 两对配对散在 install / destroy |
| 5   | [search/plugin.ts:84,98-100](../../packages/rxdb-plugin-search/src/plugin.ts#L84)                   | `SearchPluginPhase` 五态枚举 + `#installPromise` 身份比对                    | 为了处理「destroy 与异步 install 竞态」自建了一套状态机                                          |
| 6   | [search/plugin.ts:109,479-480](../../packages/rxdb-plugin-search/src/plugin.ts#L109)                | `Array<{type, listener}>` 手工监听器清单，destroy 时逐个 `removeEventListener` | 新增一处 `addEventListener` 必须记得 push 进同一个数组                                          |
| 7   | [workspace:173-174,196](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L173-L174)  | `#installPromise` + `#installFailed` + `#destroyed` 三标志                   | 第三套语义不同的安装状态机；`#destroyed` 需要在每个 `await` 之后重新检查                        |
| 8   | [workspace:185,412-425](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L185)       | `Map<CacheId, Subscription>` + 独立的 `#taskSubscription`                    | 两处订阅两套释放路径；`rollback(() => …)`（:295）已经是本原语的临时手写版                       |
| 9   | [graph/plugin.ts:33-35](../../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35)                     | `destroy()` 空实现，注释只写「注销」                                        | **契约里没有位置可写**：`install()` 调 `rxdb.repository()` 写进 `#repository_config_map`，       |
|     |                                                                                                     |                                                                             | 而 RxDB 全文只有 `.set`（:310）与 `.get`（:391），**没有反注册 API**——这不是忘写，是写不了      |

第 9 条是本 Epic 的直接触发点：它证明「靠自觉写对称的 destroy」在当前契约下**做不到**，
因为宿主根本没提供撤销入口。补一个 `unregisterRepository()` 只能解决这一处；同样的洞会在
下一个「注册型」能力上原样重现。

### 一处贯穿全部九项的不对称

[RxDB.ts:757-767](../../packages/rxdb/src/RxDB.ts#L757) 的 `#destroy_plugin()` 把每个插件 `destroy()`
的异常 `console.error` 后**吞掉**，而 `#track_plugin_install()`（:706-722）会把 `install()` 的异常
经 `#await_plugin_installs()` 抛给 `connect()`。同一个生命周期的两端，一端硬失败一端静默——
这不是某个插件的 bug，是「拆卸没有统一语义」的直接后果。

## 目标

- [ ] 在 `@aiao/utils` 提供 `EffectScope` 生命周期作用域原语，语义（逆序、幂等、异步、错误隔离、可嵌套）
      由测试冻结（[US-013](../stories/core/US-013-effect-scope-primitive.md)）
- [ ] `IRxDBPlugin` 契约改为 `install(scope)`，四个插件包全部迁移，`destroy()` 进入废弃周期
      （[US-014](../stories/core/US-014-plugin-scope-contract.md)）
- [ ] 插件可声明 `inject` 依赖，依赖未就绪时不安装、依赖消失时自动释放作用域
      （[US-015](../stories/core/US-015-plugin-inject-dependency.md)）
- [ ] `RxDB.#shutdown()` 的手工复位收敛到实例作用域——**尚无故事认领**，前置条件是上面三条全部 Done，
      背景见本文件「现状」表第 1 项
- [ ] 三框架绑定（Angular `DestroyRef` / React `useEffect` cleanup / Vue `onScopeDispose`）统一挂接到
      同一个作用域原语——**尚无故事认领**，前置条件是 US-013

## 故事

- ⬜ [US-013 EffectScope 生命周期作用域原语](../stories/core/US-013-effect-scope-primitive.md) (High)
- ⬜ [US-014 插件作用域契约](../stories/core/US-014-plugin-scope-contract.md) (High)
- ⬜ [US-015 插件依赖声明与按需装卸](../stories/core/US-015-plugin-inject-dependency.md) (Medium)

交付顺序固定为 **US-013 → US-014 → US-015**，不可交换：US-014 的 `install(scope)` 签名需要 US-013
冻结的 `EffectScope` 类型；US-015 的「依赖消失时释放」需要 US-014 已经把插件的副作用都收进作用域，
否则「释放」只能释放掉一半。

## 非目标

- **不引入依赖注入容器**。`inject` 的取值是一个封闭枚举（当前只有本地/远端适配器与已安装插件名），
  不是任意字符串键；不提供 `ctx.provide()` 式的动态服务注册表。要扩大取值范围必须另起故事并说明理由。
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

| 相邻 Epic                                       | 边界                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [epic-001 核心 MVP](epic-001-core-mvp.md)       | 001 交付的是**能力**（查询、变更、事务）；本 Epic 不新增任何能力，只改这些能力的装卸方式                            |
| [epic-007 公开 API 门禁](epic-007-public-api-gates.md) | 007 管「导出表面被增删改能否被门禁发现」；本 Epic 会**制造**一次这样的变更（`IRxDBPlugin` 成员改动），并暴露一个已知盲区：`api-surface.mjs` 只记录 `{name, kind}`，成员签名变化不触发 diff。该盲区由 US-014 用类型契约测试补，不扩大 007 的范围 |
| [epic-006 工作树](epic-006-working-tree-commits.md)   | 006 的恢复会话/物化暂存有自己的持久化生命周期，不复用本 Epic 的**进程内**作用域；两者不互为前置                    |
