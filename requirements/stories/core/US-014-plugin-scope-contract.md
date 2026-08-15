---
id: US-014
title: 插件作用域契约
status: Backlog
priority: High
epic: epic-008-lifecycle-scope
created: 2026-08-15
updated: 2026-08-15
tags: [lifecycle, plugin, public-api, breaking-candidate]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 依赖 US-013 的原语，但不依赖 US-015；单独交付后四个插件的泄漏即被修复
- [x] Negotiable (可协商): 三处语义（destroy 废弃方式、repository 反注册形式、拆卸错误在 RxDB 边界的出口）给了决策表
- [x] Valuable (有价值): 直接修掉 graph 插件「注册永不撤销」的既有泄漏，并让新插件无处可漏
- [x] Estimable (可估算): 1 个契约文件 + RxDB 三处方法 + 4 个插件迁移 + 1 个类型契约测试
- [x] Small (小): 不含依赖声明与按需重装（归 US-015），不含 RxDB.#shutdown() 的手工复位收敛（无故事认领）
- [x] Testable (可测试): 每个插件都有可断言的「拆卸后宿主状态回到安装前」判据
-->

# 用户故事：插件作用域契约

## 作为/我想要/以便

**作为** rxdb 插件的作者（含仓库内四个插件包与仓库外的第三方插件）
**我想要** 在 `install()` 里拿到一个作用域，把每个副作用和它的撤销方式写在一起
**以便** 我不必再自建一套安装状态机与手工副作用清单，也不会因为契约里没有位置可写而漏掉撤销

## 来源与边界

来源是 [epic-008](../../epics/epic-008-lifecycle-scope.md) 「现状」表的第 3～9 项。本故事把
`IRxDBPlugin` 的 `install()` / `destroy()` 两半契约收敛成一半，并迁移仓库内全部四个插件包。

**直接修掉的既有缺陷**：[graph/plugin.ts:33-35](../../../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35)
的 `destroy()` 是空的，而它的 `install()` 通过 `rxdb.repository()` 写进 `#repository_config_map`
（[RxDB.ts:310](../../../packages/rxdb/src/RxDB.ts#L310)）。该 Map 全文只有 `.set` 与 `.get`
（:114 / :310 / :391），**没有任何删除路径**——这不是插件作者忘写，是宿主没提供撤销入口。
本故事必须同时补上入口，否则「把副作用挂进作用域」在 graph 上无法落地。

**不在本故事**：`RxDB.#shutdown()`（:597-613）那 8 处手工复位的收敛。它涉及网关、事务栈、
适配器名 BehaviorSubject 与 `#rxdb_initialized`，语义各不相同且都与断连重连耦合；
先让插件侧跑一个完整发布周期，再动宿主自身。

## 范围边界

### In Scope

- `IRxDBPlugin` 契约变更：`install(scope: EffectScope)`；`destroy()` 变为可选并标 `@deprecated`
- `RxDB` 为每个插件的**每一次**安装创建独立子作用域，并在 `#shutdown()` 中按逆序串行释放
- `RxDB.unregisterRepository()`：给 `repository()` 补上对称的撤销入口（身份守卫）
- 四个插件包迁移：`rxdb-plugin-storage` / `rxdb-plugin-search` / `rxdb-plugin-graph` / `rxdb-plugin-workspace`
- 类型契约测试：锁住 `IRxDBPlugin` 的成员形状（因为 API 基线看不见成员签名变化，见技术笔记 D3）
- 插件作者文档与迁移说明

### Out of Scope

- **`inject` 依赖声明与按需装卸**——归 [US-015](US-015-plugin-inject-dependency.md)
- **`RxDB.#shutdown()` 的 8 处手工复位** 与 `#event_initialized` 守卫的移除——尚无故事认领，见 epic-008 目标第 4 条
- **拆卸错误在 `RxDB` 边界的出口**：`#destroy_plugin()`（:757-767）今天把插件拆卸异常 `console.error` 后吞掉，
  改成传播会改变 `disconnect()` / `disconnectAll()` 的可见行为，属独立的破坏性变更（决策 D4）
- **删除 `destroy()`**：本故事只让它变可选 + `@deprecated` 并继续调用；实际移除排在废弃周期结束后
- **三框架绑定接入作用域**——尚无故事认领，见 epic-008 目标第 5 条
- **`#plugin_install_promises` 的记账收敛**：安装态与作用域是两件事，本故事不动安装期错误传播路径

## 验收标准

| #   | 前置条件                                                            | 操作                                                                 | 预期结果                                                                                                                                                          | 状态 |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 已 `use()` 三个插件 A、B、C（按此顺序）并完成 `init()` + `connect()` | `disconnectAll()`                                                    | 三个作用域按 **C → B → A** 逆序、**串行**释放（不是 `Promise.all`）；每个插件的 effect 在其作用域内也逆序释放                                                        | ⬜   |
| 2   | 插件在 `install(scope)` 内登记了 effect                             | 断连后重新 `connect()`                                               | 本次安装拿到的是**全新**子作用域；上一轮的 effect 已释放且不会被二次释放；重复安装不产生双份注册                                                                    | ⬜   |
| 3   | `init()` 之后调用 `use()` 注册新插件                                | 该插件立即安装                                                       | 它同样拿到独立子作用域，并与既有插件一起参与下一次 `#shutdown()` 的逆序释放                                                                                        | ⬜   |
| 4   | 某插件仍实现了 `@deprecated` 的 `destroy()`                         | 触发 `#shutdown()`                                                   | **先**释放它的作用域，**再**调用 `destroy()`（LIFO：内层副作用先于外层拆卸）；两者都执行，顺序稳定且写进 TSDoc                                                     | ⬜   |
| 5   | 第三方插件只实现了旧契约（`install()` 无参 + `destroy()`）          | 升级 `@aiao/rxdb` 后编译并运行                                       | **编译通过**（实现方少写形参、`destroy` 由必选变可选，两者都不破坏既有实现）；运行时 `destroy()` 仍被调用，行为与升级前一致                                        | ⬜   |
| 6   | graph 插件已迁移                                                    | `init()` → `connect()` → `disconnectAll()`                           | `getRepositoryConfig('GraphRepository')` 在连接期间有值、拆卸后为 `undefined`——**既有泄漏被证伪**                                                                  | ⬜   |
| 7   | 同名 repository 已被后来者以不同 config 覆盖注册                    | 先注册者的作用域释放                                                 | `unregisterRepository()` 按**配置对象身份**守卫：不是自己那份就不删，后来者的注册保持有效                                                                          | ⬜   |
| 8   | storage 插件已迁移                                                  | 安装 → 拆卸                                                          | `rxdb.storage` 属性与 `config.entities` 中的 `StorageFileMeta` 都回到安装前状态；`#ownsStorage` / `#registeredEntity` 两个标志已从源码中删除                       | ⬜   |
| 9   | search 插件已迁移                                                   | 安装 → 拆卸                                                          | 全部实体事件监听器被解绑；`#entityEventListeners` 数组已从源码中删除；新增一处 `addEventListener` 而忘记登记的写法**不再可能**（没有第二处清单可以漏）             | ⬜   |
| 10  | workspace 插件已迁移                                                | 安装 → 拆卸                                                          | `#draft_subscriptions` 中全部订阅与 `#taskSubscription` 均已退订；:295 的手写 `rollback(() => …)` 由作用域取代                                                     | ⬜   |
| 11  | 某插件的一个 disposer 抛错                                          | 触发 `#shutdown()`                                                   | 同插件内其余 disposer **照常跑完**（US-013 AC#8 的隔离语义）；其他插件的作用域不受影响；错误在 `RxDB` 边界的处置与本故事前一致（仍为 `console.error`，见 D4）      | ⬜   |
| 12  | `IRxDBPlugin` 的成员形状                                            | 跑 `packages/rxdb/src/__tests__/contracts/` 的类型契约测试            | 契约测试断言 `install` 接受 `EffectScope`、`destroy` 为可选；**故意改坏签名时该测试失败**（API 基线只记 `{name, kind}`，看不见这次变更，见 D3）                     | ⬜   |
| 13  | 全部改动完成                                                        | `pnpm nx run-many -t lint test build --projects=tag:js-lib` 与门禁脚本 | 零 ESLint 警告；`@aiao/rxdb` 四项覆盖率 ≥ **90%**，四个插件包 ≥ **80%**；`api-surface.mjs --check` 通过（`unregisterRepository` 是 `RxDB` 的方法，不改导出表面）    | ⬜   |
| 14  | 文档                                                                | 检查插件作者文档与迁移说明                                            | 新契约的写法、`destroy()` 的废弃周期与「不要同时用两者」的指引已落到 `website/docs/plugins/` 与 `website/docs/migration/`；四个包的 README 示例同步                | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> 最容易漏的是 **AC#5（旧插件零编译破坏）** 与 **AC#12（门禁看不见这次变更）**。
> 前者决定这次改动能不能不走破坏性版本：TypeScript 允许实现方少写形参、也允许实现一个可选成员，
> 所以「加参数 + 把 `destroy` 变可选」对既有实现是**零影响**的——这个结论必须有真实的编译用例证明，
> 不能靠推断。后者是本仓库门禁的一个真实盲区：[utils.json](../../api-baseline/utils.json) 与
> [rxdb.json](../../api-baseline/rxdb.json) 记录的是 `{"name": "IRxDBPlugin", "kind": "type"}`，
> **成员签名怎么改都不会产生 diff**，所以 CI 的绿色在这条变更上不构成任何证据。

## 技术笔记

### 目标契约

```ts
export interface IRxDBPlugin {
  name: Uncapitalize<string>;
  install(scope: EffectScope): void | Promise<void>;
  /** @deprecated 改用 `install(scope)` 登记副作用；本成员将在废弃周期结束后移除。 */
  destroy?(): void | Promise<void>;
}
```

迁移前后对照（以 storage 为例，[plugin.ts:33-64](../../../packages/rxdb-plugin-storage/src/plugin.ts#L33-L64)）：

```ts
// 前：构造函数 defineProperty，destroy 里 deleteProperty；两处相隔 20 行，靠 #ownsStorage 串起来
// 后：
install(scope: EffectScope) {
  scope.effect(() => {
    Object.defineProperty(this.rxdb, 'storage', { value: this.storage, /* … */ });
    return async () => { await this.storage.destroy(); Reflect.deleteProperty(this.rxdb, 'storage'); };
  }, 'storage:defineProperty');

  scope.effect(() => {
    const entities = this.rxdb.config.entities as RxDB['config']['entities'];
    entities.push(StorageFileMeta);
    return () => { const i = entities.indexOf(StorageFileMeta); if (i >= 0) entities.splice(i, 1); };
  }, 'storage:registerEntity');
}
```

`#ownsStorage` 与 `#registeredEntity` 随之消失：前者判断的「是不是我装的」由「effect 只在我这个
作用域里登记」天然回答，后者判断的「装没装成」由 disposer 是否存在回答。

### 待冻结的四个决策

#### D1 — `destroy()` 怎么退场

| 方案                                                | 主要风险                                                                                                                          | 结论        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 直接删除 `destroy()`                                | 第三方插件**编译报错易发现，但运行时静默不再被调用**才是真危险；0.x 允许破坏，但没有理由现在就付这个代价                            | ❌          |
| 变可选 + `@deprecated`，继续调用（AC#4 / AC#5）     | 过渡期内两套拆卸路径并存，插件作者可能两边都写                                                                                     | ✅ **推荐** |
| 双契约长期并存                                      | 「两套拆卸语义」正是本 Epic 要消灭的东西，不设期限等于不做                                                                         | ❌          |

推荐方案的关键性质是**零编译破坏**（AC#5）：给 `install` 加形参不影响已有的无参实现，
把必选成员改成可选也不影响已有的实现者。因此这次变更**不需要**破坏性版本，
按 [versioning-policy.md](../../versioning-policy.md) 第 3 节走标准废弃周期即可
（至少保留一个次版本，移除时在 `website/docs/migration/` 记录）。

#### D2 — `repository()` 的撤销入口长什么样

| 方案                                            | 主要风险                                                                              | 结论        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| 改 `repository()` 返回 disposer                 | 它当前返回 `this` 支持链式调用（[:308-312](../../../packages/rxdb/src/RxDB.ts#L308-L312)），改返回值是**真破坏** | ❌          |
| 新增 `unregisterRepository(name, config)`       | 公开表面多一个方法；调用方要自己保证成对                                              | ✅ **推荐** |
| 只在 `#shutdown()` 里整体 `clear()` 该 Map      | 与作用域语义脱节：插件作用域单独释放时（US-015 的场景）撤销不了                        | ❌          |

`unregisterRepository` 必须按**配置对象身份**守卫（AC#7）：只有存储的那份就是调用方传入的那份时才删除。
否则「A 注册 → B 覆盖注册同名 → A 拆卸」会把 B 的注册误删。同一守卫思路已经在
[RxDB.#closeTransactionContext](../../../packages/rxdb/src/RxDB.ts#L561-L564)（按身份从栈中摘除，
而非假定在栈顶）用过，口径一致。

#### D3 — 这次变更由什么门禁守

`api-surface.mjs` 生成的基线条目形如 `{"name": "IRxDBPlugin", "kind": "type"}`——**只有名字与种类**。
把 `install()` 改签名、把 `destroy()` 变可选，基线 diff 全部为空，`--check` 照样绿。

按 [versioning-policy.md](../../versioning-policy.md) 第 4 节的三层守护，能覆盖成员签名的只有
**编译期类型契约**（`packages/rxdb/src/__tests__/contracts/`）。因此 AC#12 要求本故事新增一个
契约测试，并且**该测试必须能在签名被改坏时失败**（写完先故意改坏跑一次红，再改回来）。

这条盲区本身属于 [epic-007](../../epics/epic-007-public-api-gates.md) 的主题，但**不扩大它的范围**：
本故事只为自己这次变更补一个契约测试，不承担「让基线记录成员签名」这项通用能力。

#### D4 — 拆卸错误在 `RxDB` 边界的出口（本故事不改）

今天的不对称：`#destroy_plugin()`（[:757-767](../../../packages/rxdb/src/RxDB.ts#L757)）对每个插件
try/catch 后 `console.error` 吞掉；而 `#track_plugin_install()`（:706-722）会把安装错误经
`#await_plugin_installs()`（:725-739）抛给 `connect()`。

本故事**只改插件内部**的拆卸语义（逆序、不短路、串行），**不改** `RxDB` 边界的吞错行为——
改了会让 `disconnect()` / `disconnectAll()` 从「一定 resolve」变成「可能 reject」，
这是用户可见的破坏性变更，需要单独的故事与迁移说明。AC#11 显式把这条钉成「与本故事前一致」，
避免实现时顺手改掉。

### 实现约束

- `RxDB` 侧新增一个实例级根作用域，`#plugin_scopes: Map<IRxDBPlugin, EffectScope>`；
  `#shutdown()` 中按 `#plugin_map` 的**逆插入序**串行释放，替换现有 `#destroy_plugin()` 的 `Promise.all`
- `RxDBPluginBase` **不**存储 scope：同一个插件实例会被断连重连多次安装，存下来必然拿到已释放的旧作用域。
  作用域只经形参传递，用完即弃（AC#2）
- 插件内部若需要在 `install()` 之外访问作用域（如 search 的 `#runInstall()` 异步续做），
  应把作用域作为参数继续往下传，不要挂到实例字段上
- search 的 `SearchPluginPhase` 与 workspace 的三标志在本故事**不强制删除**：它们除了拆卸还承担
  `ready` 语义（[search:121-131](../../../packages/rxdb-plugin-search/src/plugin.ts#L121)）与
  「destroy 后不许再 search」的守卫。本故事只要求把**副作用清单**部分交给作用域（AC#9 / AC#10），
  安装态语义的收敛留给 US-015
- 估算：契约 + RxDB 侧 ~120 行；四个插件迁移各 ~30～60 行；类型契约测试 ~60 行；测试与文档另计

## 实现文件

- `packages/rxdb/src/rxdb-plugin.ts` — `IRxDBPlugin` 契约变更与 TSDoc 废弃标注
- `packages/rxdb/src/RxDB.ts` — 根作用域、`#plugin_scopes`、`#install_one_plugin` / `#destroy_plugin` 改造、`unregisterRepository()`
- `packages/rxdb/src/__tests__/contracts/plugin-scope-contract.spec.ts` — 成员形状的编译期契约（D3）
- `packages/rxdb-plugin-storage/src/plugin.ts` — 两对配对收进作用域，删 `#ownsStorage` / `#registeredEntity`
- `packages/rxdb-plugin-search/src/plugin.ts` — 事件监听器登记改为 effect，删 `#entityEventListeners`
- `packages/rxdb-plugin-graph/src/plugin.ts` — `repository()` 与 `unregisterRepository()` 成对收进一个 effect，删空 `destroy()`
- `packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts` — 订阅与 `rollback(…)` 改为 effect
- `website/docs/plugins/` · `website/docs/migration/` — 新契约写法与废弃说明
- `requirements/api-baseline/rxdb.json` — 若导出表面确有变化则同步（预期无变化，见 D3）

## References

- [epic-008 生命周期作用域](../../epics/epic-008-lifecycle-scope.md)
- [US-013 EffectScope 生命周期作用域原语](US-013-effect-scope-primitive.md) — 前置故事，提供 `EffectScope`
- [US-015 插件依赖声明与按需装卸](US-015-plugin-inject-dependency.md) — 后继故事，收敛安装态语义
- [versioning-policy.md](../../versioning-policy.md) 第 3、4 节 — 废弃周期与三层 API 守护
- [epic-007 公开 API 门禁](../../epics/epic-007-public-api-gates.md) — D3 盲区的长期归属
