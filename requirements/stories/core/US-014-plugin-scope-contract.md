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
- [x] Independent (独立): 依赖 US-013 的原语，但不依赖 US-015 系列；单独交付后四个插件的泄漏即被修复
- [x] Negotiable (可协商): 四处语义（destroy 退场方式、repository 撤销形式、作用域层级、拆卸错误在 RxDB 边界的出口）给了决策表
- [x] Valuable (有价值): 直接修掉 graph 插件「注册永不撤销」与 storage「构造期获取 / 拆卸期释放」两处既有泄漏
- [x] Estimable (可估算): 1 个契约文件 + RxDB 侧作用域层级 + 4 个插件迁移 + 1 个类型契约测试
- [x] Small (小): 本链条中最大的一个，但仍是**一套机制在四个调用点上的验证**，不是四件事；
      按机制切（契约 / 迁移）会让先交付的那半没有任何用户可见价值——graph 的泄漏要到迁移那半才修掉
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

### 直接修掉的两处既有缺陷

**其一，graph 插件的撤销无处可写。**
[graph/plugin.ts:33-35](../../../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35) 的 `destroy()` 是空的，
而它的 `install()` 通过 `rxdb.repository()` 写进 `#repository_config_map`
（[RxDB.ts:310](../../../packages/rxdb/src/RxDB.ts#L310)）。该 Map 全文只有 `.set` 与 `.get`
（:114 / :310 / :391），**没有任何删除路径**——这不是插件作者忘写，是宿主没提供撤销入口。

**其二，storage 插件的获取与释放寿命不同。**
[storage/plugin.ts:34-39](../../../packages/rxdb-plugin-storage/src/plugin.ts#L34-L39) 在**构造器**里
`Object.defineProperty(rxdb, 'storage', …)`，而 [:53-57](../../../packages/rxdb-plugin-storage/src/plugin.ts#L53-L57)
在 `destroy()` 里 `Reflect.deleteProperty`。构造器只在 `use()` 时跑一次
（插件实例被 `#plugin_map` 缓存，[:339-343](../../../packages/rxdb/src/RxDB.ts#L339-L343)），
`destroy()` 却每次 `#shutdown()` 都跑——**断连一次之后 `rxdb.storage` 就永久消失，重连不会恢复**。
把 `defineProperty` 移进 `install(scope)` 会顺带修掉它（AC#9）。

> ⚠️ **只挪 `defineProperty` 不够。** `new RxdbFileStorage(rxdb, options)` 本身也在构造器里
> （[storage/plugin.ts:29-31](../../../packages/rxdb-plugin-storage/src/plugin.ts#L29-L31)），
> 而 `destroy()` 会 `await this.storage.destroy()`。只搬属性定义，重连时 `defineProperty` 会把
> **同一个已 destroy 的 storage 实例**重新装回去。判据见 D7：**构造器只创建插件对象本身，
> 一切按纪元存活的资源都在 `install(scope)` 里获取**。

**其三，workspace 的终态标志挡住了重连。** [`#destroyed`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L196)
是终态标志、从不复位（`destroy()` 在 :404-405 置 `true`，此后 :316 的守卫让每次写操作直接抛）；
而 [`readonly #indexedDBStore!: WorkspaceStore`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L169)
是 `readonly` + definite assignment，构造器之后**在类型上就无法重新赋值**。

这三条的共同形状是同一个：**资源的获取点与释放点寿命不同**。它也是本故事的必要性来源——
迁到 `install(scope)` 之后，获取与释放天然同寿命，上面三处泄漏一起消失。

### 不在本故事

`RxDB.#shutdown()`（:605-621）那 8 处手工复位的收敛。本故事只创建并释放**连接纪元作用域**
这一层容器（D3），把 8 处复位迁进去归 `US-016`（🚧 文件未创建，价值待证）。

## 范围边界

### In Scope

- `IRxDBPlugin` 契约变更：`install(scope: LifecycleScope)`；新增 `lifecycle?: 'scoped'` 标记；
  `destroy()` 变为可选并标 `@deprecated`
- **作用域层级**（D3）：连接纪元作用域 + 每次安装一个插件激活作用域
- 安装**半途失败**时的资源回收语义（AC#12～#15）
- `RxDB.repository()` 增加可选的 `scope` 形参，注册与撤销一次写完（D2）
- 四个插件包迁移：`rxdb-plugin-storage` / `rxdb-plugin-search` / `rxdb-plugin-graph` / `rxdb-plugin-workspace`
- 类型契约测试：锁住 `IRxDBPlugin` 的成员形状（因为 API 基线看不见成员签名变化，见 D4）
- 插件作者文档与迁移说明

### Out of Scope

- **`inject` 依赖声明与按需装卸**——归 [US-015](US-015-plugin-inject-dependency.md) 系列
- **`RxDB.#shutdown()` 的 8 处手工复位** 与 `#event_initialized` 守卫的移除——归 `US-016`（🚧 文件未创建，价值待证）
- **注册期资源的释放**。`use()` 时挂上的实例属性今天**在物理上就不可撤销**：
  [search:552-557](../../../packages/rxdb-plugin-search/src/plugin.ts#L552) 的 `searchPlugin` 与
  [workspace:278-283](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L278) 的 `workspace`
  都是 `configurable: false`。要覆盖它们需要先有 `RxDB.destroy()` / `unuse()`——本故事不提供，
  也**不宣称**注册期属性已纳入自动释放（D3）
- **拆卸错误在 `RxDB` 边界的出口**：`#destroy_plugin()`（:765-775）今天把插件拆卸异常 `console.error` 后吞掉，
  改成传播会改变 `disconnect()` / `disconnectAll()` 的可见行为，属独立的破坏性变更（D5）
- **删除 `destroy()`**：本故事只让它变可选 + `@deprecated`；实际移除排在废弃周期结束后
- **三框架绑定接入作用域**——归 `US-017`（🚧 文件未创建，价值待证）
- **`#plugin_install_promises` 的记账收敛**：安装态与作用域是两件事，本故事不动安装期错误传播路径

## 验收标准

| #   | 前置条件                                                             | 操作                                                                   | 预期结果                                                                                                                                                                                                | 状态 |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 已 `use()` 三个插件 A、B、C（按此顺序）并完成 `init()` + `connect()` | `disconnectAll()`                                                      | 三个激活作用域按 **C → B → A** 逆序、**串行**释放（不是 `Promise.all`）；每个插件的条目在其作用域内也逆序释放                                                                                           | ⬜   |
| 2   | 插件在 `install(scope)` 内登记了条目                                 | 断连后重新 `connect()`                                                 | 本次安装拿到的是**全新**激活作用域，且它挂在**全新**的连接纪元作用域下；上一轮的条目已释放且不会被二次释放；重复安装不产生双份注册                                                                      | ⬜   |
| 3   | `init()` 之后调用 `use()` 注册新插件                                 | 该插件立即安装                                                         | 它同样拿到独立激活作用域，并与既有插件一起参与下一次 `#shutdown()` 的逆序释放                                                                                                                           | ⬜   |
| 4   | 插件声明了 `lifecycle: 'scoped'` 且**也**实现了 `destroy()`          | 触发 `#shutdown()`                                                     | **只**释放作用域；`destroy()` **不被调用**——双版本插件在新宿主上只清理一次（D6）                                                                                                                        | ⬜   |
| 5   | 插件**未**声明 `lifecycle`（旧插件），实现了 `destroy()`             | 触发 `#shutdown()`                                                     | 先释放它那个（通常为空的）激活作用域，再调用 `destroy()`；行为与升级前一致                                                                                                                              | ⬜   |
| 6   | 第三方插件只实现了旧契约（`install()` 无参 + `destroy()`）           | 升级 `@aiao/rxdb` 后编译并运行                                         | **编译通过**（实现方少写形参、`destroy` 由必选变可选、`lifecycle` 为可选，三者都不破坏既有实现）；运行时 `destroy()` 仍被调用                                                                           | ⬜   |
| 7   | graph 插件已迁移                                                     | `init()` → `connect()` → `disconnectAll()`                             | `getRepositoryConfig('GraphRepository')` 在连接期间有值、拆卸后为 `undefined`——**既有泄漏被证伪**                                                                                                       | ⬜   |
| 8   | 同名 repository 已被后来者以不同 config 覆盖注册                     | 先注册者的作用域释放                                                   | 撤销按**配置对象身份**守卫：不是自己那份就不删，后来者的注册保持有效                                                                                                                                    | ⬜   |
| 9   | storage 插件已迁移                                                   | 连接 → 断连 → **重新连接**                                             | `rxdb.storage` 与 `config.entities` 中的 `StorageFileMeta` 在每一轮连接期都存在、每一轮断连后都消失——**构造期获取 / 拆卸期释放的寿命错配被修掉**；`#ownsStorage` / `#registeredEntity` 已从源码删除     | ⬜   |
| 10  | search 插件已迁移                                                    | 安装 → 拆卸                                                            | 全部实体事件监听器被解绑；`#entityEventListeners` 数组已从源码中删除；新增一处 `addEventListener` 而忘记登记的写法**不再可能**（没有第二处清单可以漏）                                                  | ⬜   |
| 11  | workspace 插件已迁移                                                 | 安装 → 拆卸                                                            | `#draft_subscriptions` 中全部订阅与 `#taskSubscription` 均已退订；:295 的手写 `rollback(() => …)` 由作用域取代                                                                                          | ⬜   |
| 12  | 插件在登记 A、B 之后 `install()` **同步 throw**                      | `connect()`                                                            | 已登记的 B、A 逆序释放；安装错误**原样**经 `#await_plugin_installs()` 传播给 `connect()`（与本故事前一致）                                                                                              | ⬜   |
| 13  | 同上，但 `install()` 是 **async 且 reject**                          | `connect()`                                                            | 同 AC#12：已登记条目逆序释放，安装错误原样传播                                                                                                                                                          | ⬜   |
| 14  | 安装失败**且**回收期间某个 disposer 也抛错                           | `connect()`                                                            | 两个错误都被保留：`connect()` 收到的仍是**安装错误**（原因），清理错误不得覆盖它；清理错误按 D5 在 `RxDB` 边界 `console.error`                                                                          | ⬜   |
| 15  | 承接 AC#12～#14                                                      | 检查该插件状态                                                         | 失败插件的激活作用域已进入 `disposed` 且**不进入**已安装集合；下一次纪元（重连）使用**全新**作用域重试，不复用失败的那个                                                                                | ⬜   |
| 16  | 已 `connect()` 且插件均已安装                                        | `disconnectAll()` 后再次 `connect()`                                   | `#shutdown()` 释放了连接纪元作用域；重连创建的是**全新**连接纪元作用域（不是在已 `disposed` 的作用域上 `child()`，那会抛 `LifecycleScopeDisposedError`）                                                | ⬜   |
| 17  | 某插件的一个 disposer 抛错                                           | 触发 `#shutdown()`                                                     | 同插件内其余 disposer **照常跑完**（US-013 AC#8 的隔离语义）；其他插件的作用域不受影响；错误在 `RxDB` 边界的处置与本故事前一致（仍为 `console.error`，见 D5）                                           | ⬜   |
| 18  | `IRxDBPlugin` 的成员形状                                             | 跑 `packages/rxdb/src/__tests__/contracts/` 的类型契约测试             | 契约测试断言 `install` 接受 `LifecycleScope`、`destroy` 与 `lifecycle` 均为可选、`lifecycle` 只接受 `'scoped'` 字面量；**故意改坏签名时该测试失败**（见 D4）                                            | ⬜   |
| 19  | 全部改动完成                                                         | `pnpm nx run-many -t lint test build --projects=tag:js-lib` 与门禁脚本 | 零 ESLint 警告；`@aiao/rxdb` 四项覆盖率 ≥ **90%**，四个插件包 ≥ **80%**；`api-surface.mjs --check` 通过。**注意**：`repository()` 与 `IRxDBPlugin` 的成员变更属公开 API 变更，只是不产生基线 diff（D4） | ⬜   |
| 20  | 文档                                                                 | 检查插件作者文档与迁移说明                                             | 新契约写法、`lifecycle: 'scoped'` 的含义、`destroy()` 的废弃周期与双版本插件的写法已落到 `website/docs/plugins/` 与 `website/docs/migration/`；四个包 README 同步                                       | ⬜   |
| 21  | 插件**只**声明 `lifecycle: 'scoped'`，**不**实现 `destroy`           | 触发 `#shutdown()`                                                     | 不抛 `TypeError`：`#destroy_plugin()` 必须写成 `await plugin.destroy?.()`。**今天写成 `await plugin.destroy()` 无保护调用**，契约一改成可选，第一个纯作用域插件就在拆卸路径上崩（S-007）                | ⬜   |
| 22  | `init()` 中 `schemaManager.init()` 抛错                              | 捕获后检查插件与作用域状态                                             | 连接纪元作用域已释放且置空、已安装插件已回滚——`#install_plugin()` 在 `try` **之外**（[:283-285](../../../packages/rxdb/src/RxDB.ts#L283-L285)），今天只把 `#rxdb_initialized` 拨回 `false`（S-005）     | ⬜   |
| 23  | 承接 AC#22                                                           | 修复问题后重新 `init()`                                                | 插件被**重新**安装到**全新**的连接纪元作用域下，不是叠在上一轮的半成品上；重复 `init()` 不产生双份注册                                                                                                  | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> **AC#3 的夹具脚注**（第二轮评审 S-003 降级后的落点）：本故事的「`use()` 后立即安装」与
> `US-015` INV-4 的「依赖未满足的插件不进入 `#plugin_install_promises`」**不冲突**——两者不在同一
> 时间点生效，US-015 系列落地后才有「依赖未满足」这个状态。但 AC#3 的测试**不要**断言
> 「**所有**插件都立即安装」，只断言被测的那一个；否则该夹具会在 US-015a 落地当天变红。
>
> 最容易漏的是 **AC#12～#15（安装半途失败的回收）** 与 **AC#18（门禁看不见这次变更）**。
> 前者是新契约独有的失败模式：旧契约下 `install()` 抛错只是「没装成」，插件自己在 catch 里收拾；
> 新契约下宿主已经替它拿着一份**部分登记**的清单，宿主不释放就没有别人会释放。
> 后者是本仓库门禁的一个真实盲区：[utils.json](../../api-baseline/utils.json) 与
> [rxdb.json](../../api-baseline/rxdb.json) 记录的是 `{"name": "IRxDBPlugin", "kind": "type"}`，
> **成员签名怎么改都不会产生 diff**，所以 CI 的绿色在这条变更上不构成任何证据。

## 技术笔记

### 今天的契约（对照用）

[`rxdb-plugin.ts:6-10`](../../../packages/rxdb/src/rxdb-plugin.ts#L6-L10)：

```ts
export interface IRxDBPlugin {
  name: Uncapitalize<string>;
  install(): void | Promise<void>;
  destroy(): void | Promise<void>; // ← 今天是**必选**，不是 destroy?()
}
```

两处后果，均须在实现里同时处理（S-007）：

1. `destroy` 由必选变可选，对**实现者**无破坏（AC#6 成立），但对**调用者**有——
   `RxDB.#destroy_plugin()` 今天写的是 `await plugin.destroy()`，**无可选链保护**
   （[:765-775](../../../packages/rxdb/src/RxDB.ts#L765-L775)）。必须一并改为 `await plugin.destroy?.()`，
   否则第一个只写 `install(scope)` 的插件在拆卸路径上抛 `TypeError`（AC#21）。
2. 这正是 D4 那个门禁盲区的一次真实实例：`destroy` 从必选变可选，
   基线里的 `{"name": "IRxDBPlugin", "kind": "type"}` 一个字都不变。

### 目标契约

```ts
export interface IRxDBPlugin {
  name: Uncapitalize<string>;
  /**
   * 声明本插件用 `install(scope)` 登记全部副作用。
   * 宿主据此**只**释放作用域，不再调用 `destroy()`——双版本插件因此不会被清理两次。
   */
  readonly lifecycle?: 'scoped';
  install(scope: LifecycleScope): void | Promise<void>;
  /** @deprecated 改用 `install(scope)` 登记副作用；声明 `lifecycle: 'scoped'` 后本成员不再被调用，并将在废弃周期结束后移除。 */
  destroy?(): void | Promise<void>;
}
```

迁移前后对照（以 storage 为例，[plugin.ts:19-64](../../../packages/rxdb-plugin-storage/src/plugin.ts#L19-L64)）：

```ts
// 前：构造器 defineProperty，destroy 里 deleteProperty；两者寿命不同（见「来源与边界」其二）
// 后：
readonly lifecycle = 'scoped' as const;

install(scope: LifecycleScope) {
  scope.acquire(() => {
    Object.defineProperty(this.rxdb, 'storage', { value: this.storage, configurable: true, /* … */ });
    return async () => { await this.storage.destroy(); Reflect.deleteProperty(this.rxdb, 'storage'); };
  }, 'storage:defineProperty');

  scope.acquire(() => {
    const entities = this.rxdb.config.entities as RxDB['config']['entities'];
    entities.push(StorageFileMeta);
    return () => { const i = entities.indexOf(StorageFileMeta); if (i >= 0) entities.splice(i, 1); };
  }, 'storage:registerEntity');
}
```

`#ownsStorage` 与 `#registeredEntity` 随之消失：前者判断的「是不是我装的」由「条目只在我这个
作用域里登记」天然回答，后者判断的「装没装成」由 disposer 是否存在回答。

### 待冻结的七个决策

#### D1 — `destroy()` 怎么退场

| 方案                                      | 主要风险                                                                                                 | 结论        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| 直接删除 `destroy()`                      | 第三方插件**编译报错易发现，但运行时静默不再被调用**才是真危险；0.x 允许破坏，但没有理由现在就付这个代价 | ❌          |
| 变可选 + `@deprecated` + `lifecycle` 标记 | 过渡期内两套拆卸路径并存（由 D6 的标记消歧）                                                             | ✅ **推荐** |
| 双契约长期并存                            | 「两套拆卸语义」正是本 Epic 要消灭的东西，不设期限等于不做                                               | ❌          |

推荐方案的关键性质是**零编译破坏**（AC#6）：给 `install` 加形参不影响已有的无参实现，
把必选成员改成可选、新增一个可选成员也都不影响已有的实现者。因此这次变更**不需要**破坏性版本，
按 [versioning-policy.md](../../versioning-policy.md) 第 3 节走标准废弃周期即可
（至少保留一个次版本，移除时在 `website/docs/migration/` 记录）。

#### D2 — `repository()` 的撤销入口长什么样

| 方案                                            | 主要风险                                                                                                         | 结论        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `repository(name, config, scope?)` 内部登记撤销 | `repository()` 的签名变了（新增可选形参），属公开 API 变更，需要 TSDoc 与迁移说明                                | ✅ **推荐** |
| 新增公开 `unregisterRepository(name, config)`   | 又造出一组**需要人工配对**的公开 API——与本 Epic 的目标正好相反；调用方仍然可以忘记配对                           | ❌          |
| 改 `repository()` 返回 disposer                 | 它当前返回 `this` 支持链式调用（[:308-312](../../../packages/rxdb/src/RxDB.ts#L308-L312)），改返回值是**真破坏** | ❌          |
| 只在 `#shutdown()` 里整体 `clear()` 该 Map      | 与作用域语义脱节：插件作用域单独释放时（US-015 系列的场景）撤销不了                                              | ❌          |

推荐签名：

```ts
public repository<RT extends RepositoryInstance>(
  repositoryName: string,
  config: IRepositoryConfig<RT>,
  scope?: LifecycleScope
): this;
```

传了 `scope` 时，`repository()` 内部完成三件事：写入 config、在 `scope` 上登记一条按
**配置对象身份**守卫的撤销、照旧返回 `this`。不传 `scope` 时行为与今天完全一致（应用启动期的
静态注册不需要撤销）。graph 插件改成 `this.rxdb.repository('GraphRepository', config, scope)` 即可，
**没有裸的反注册方法可以被忘记调用**。

身份守卫（AC#8）是必需的：只有存储的那份就是调用方传入的那份时才删除，否则
「A 注册 → B 覆盖注册同名 → A 拆卸」会把 B 的注册误删。同一守卫思路已经在
[RxDB.#closeTransactionContext](../../../packages/rxdb/src/RxDB.ts#L569-L572)（按身份从栈中摘除，
而非假定在栈顶）用过，口径一致。撤销本身用私有方法实现，不进公开表面。

#### D3 — 作用域层级与重连语义

必须先回答一个矛盾：如果只有「一个实例级根作用域」，它在 `#shutdown()` 时释放之后就再也
`child()` 不出新作用域了（US-013 AC#5：非 active 时抛错）；如果它不释放，它又不是本次连接资源的所有者。

答案是**三层**，本故事冻结前两层的边界：

```text
RxDB 注册期            use() 起；今天没有释放点（无 RxDB.destroy() / unuse()）
└── 连接纪元作用域      init() 创建，#shutdown() 释放，重连创建全新的（AC#16）
    ├── 适配器作用域    ← 本故事不创建，归 US-016
    └── 插件激活作用域  ← 每次 install 一个，逆插入序串行释放（AC#1）
```

连接纪元作用域与 `#rxdb_initialized`（[:605-621](../../../packages/rxdb/src/RxDB.ts#L605-L621) 里被复位）
**寿命完全相同**——这正是 US-016 能把那个布尔换成作用域状态的原因。

这一层级也解释了为什么**注册期资源不在本故事**：`searchPlugin` / `workspace` 两个实例属性是
`configurable: false` 的，即使有作用域也删不掉。Epic 愿景里的「实例级属性注入」在本故事的
覆盖范围内应读作「**激活期**实例属性」（storage 的 `rxdb.storage` 就是，AC#9 把它修对了）。

#### D4 — 这次变更由什么门禁守

`api-surface.mjs` 生成的基线条目形如 `{"name": "IRxDBPlugin", "kind": "type"}`——**只有名字与种类**。
把 `install()` 改签名、把 `destroy()` 变可选、给 `repository()` 加形参，基线 diff 全部为空，`--check` 照样绿。

**基线看不见 ≠ 公开 API 没变。** 按 [versioning-policy.md](../../versioning-policy.md) 第 2 节，
`IRxDBPlugin` 的成员与 `RxDB` 的公开方法签名都属公开 API；本故事对两者都做了变更（向后兼容的那类），
必须走 TSDoc + 迁移说明（AC#20），不能因为 CI 绿就当作无事发生。

按第 4 节的三层守护，能覆盖成员签名的只有**编译期类型契约**
（`packages/rxdb/src/__tests__/contracts/`）。因此 AC#18 要求本故事新增一个契约测试，
并且**该测试必须能在签名被改坏时失败**（写完先故意改坏跑一次红，再改回来）。

这条盲区本身属于 [epic-007](../../epics/epic-007-public-api-gates.md) 的主题，但**不扩大它的范围**：
本故事只为自己这次变更补一个契约测试，不承担「让基线记录成员签名」这项通用能力。

#### D5 — 拆卸错误在 `RxDB` 边界的出口（本故事不改）

今天的不对称：`#destroy_plugin()`（[:765-775](../../../packages/rxdb/src/RxDB.ts#L765)）对每个插件
try/catch 后 `console.error` 吞掉；而 `#track_plugin_install()`（:714-731）会把安装错误经
`#await_plugin_installs()`（:733-748）抛给 `connect()`。

本故事**只改插件内部**的拆卸语义（逆序、不短路、串行），**不改** `RxDB` 边界的吞错行为——
改了会让 `disconnect()` / `disconnectAll()` 从「一定 resolve」变成「可能 reject」，
这是用户可见的破坏性变更，需要单独的故事与迁移说明。AC#17 显式把这条钉成「与本故事前一致」，
避免实现时顺手改掉。

注意 AC#14 与本决策**不冲突**：安装失败的回收发生在 `connect()` 路径上，安装错误照旧传播；
只有回收过程中额外产生的清理错误走 `console.error`。

#### D6 — 新旧契约并存时怎么保证「只清理一次」

危险场景：第三方插件要同时支持旧宿主和新宿主。旧宿主调 `install()` 不传参、只认 `destroy()`；
新宿主传 scope。合理的双版本实现会**两样都写**——于是新宿主释放作用域**又**调用 `destroy()`，
清理跑两遍。

| 方案                             | 主要风险                                                                      | 结论        |
| -------------------------------- | ----------------------------------------------------------------------------- | ----------- |
| 显式 `lifecycle?: 'scoped'` 标记 | 契约多一个成员；插件作者要记得声明（漏声明只是退化为旧行为，不会双清）        | ✅ **推荐** |
| 按 `install.length` 判断版本     | 函数 arity 会被**转译、`bind`、压缩**改变；同一份源码在不同构建产物下判断不同 | ❌          |
| 只在文档里要求「不要同时用两者」 | 文档约束解决不了跨版本兼容——插件作者**必须**两样都写才能同时支持两代宿主      | ❌          |
| 检测作用域里是否登记过条目       | 插件在某个纪元合法地一条都没登记（依赖未满足、配置为空）时会被误判成旧插件    | ❌          |

标记的取值现在只有 `'scoped'` 一个字面量，留出将来加值的余地；漏声明的失败模式是**安全**的
（退回到调用 `destroy()`，与升级前一致）。

#### D7 — 构造器与 `install(scope)` 的分工（迁移的硬判据）

三处泄漏（storage 的 `rxdb.storage`、workspace 的 `#destroyed` / `#indexedDBStore`、graph 的空
`destroy()`）都是同一个错误的三次出现：**资源在构造器里获取，却在每次拆卸时释放**，
而构造器因 `#plugin_map` 缓存**只跑一次**。

| 方案                                           | 主要风险                                                                          | 结论        |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| 构造器只创建插件对象本身，纪元资源进 `install` | 四个插件都要改构造器，`readonly` 字段需改为可空（workspace 的 `#indexedDBStore`） | ✅ **推荐** |
| 构造器照旧获取，`destroy()` 里补「重新获取」   | 每个插件各写一份复活逻辑；`#destroyed` 这类终态标志还要各自设计复位时机           | ❌          |
| 让 `#plugin_map` 每个纪元重建插件实例          | 改的是宿主的插件身份语义（`use()` 按工厂去重），影响面远超本故事                  | ❌          |

**判据（迁移时逐条对照）**：构造器里只允许留下不随连接纪元变化的东西——`super(rxdb)`、
纯配置解析、`name` / `lifecycle` 常量。任何满足以下之一的都必须移进 `install(scope)`：

- 需要释放（`close()` / `destroy()` / `unsubscribe()` / `removeEventListener`）
- 改写了宿主（`defineProperty`、`config.entities.push`、`repository()`）
- 带终态标志（`#destroyed` 这类「一旦置位就再也回不去」的布尔）

workspace 的 `readonly #indexedDBStore!: WorkspaceStore` 因此要改为可空的非 `readonly` 字段
（或改为作用域内局部变量 + getter）——这是**编译期**阻塞项，不是风格问题。
`#destroyed` 随作用域一起消失：「已释放」由作用域的 `state` 回答。

### 实现约束

- `RxDB` 侧新增 `#connection_scope: LifecycleScope | undefined`，在 `init()` 中创建、`#shutdown()` 中释放并置空；
  `#plugin_scopes: Map<IRxDBPlugin, LifecycleScope>` 存每次安装的激活作用域
- `#shutdown()` 中按 `#plugin_map` 的**逆插入序**串行释放，替换现有 `#destroy_plugin()` 的 `Promise.all`
- 安装失败的回收（AC#12～#15）必须在**创建作用域的那一层**用 `try/catch` 包住 `await plugin.install(scope)`：
  catch 里先 `await scope.dispose()`（其错误单独 `console.error`），再把原始安装错误重新抛出
- `RxDBPluginBase` **不**存储 scope：同一个插件实例会被断连重连多次安装，存下来必然拿到已释放的旧作用域。
  作用域只经形参传递，用完即弃（AC#2）
- 插件内部若需要在 `install()` 之外访问作用域（如 search 的 `#runInstall()` 异步续做），
  应把作用域作为参数继续往下传，不要挂到实例字段上
- search 的 `SearchPluginPhase` 与 workspace 的三标志在本故事**不强制删除**：它们除了拆卸还承担
  `ready` 语义（[search:121-131](../../../packages/rxdb-plugin-search/src/plugin.ts#L121)）与
  「destroy 后不许再 search」的守卫。本故事只要求把**副作用清单**部分交给作用域（AC#10 / AC#11），
  安装态语义的收敛留给 `US-015a`（🚧 文件未创建）
- `#destroy_plugin()` 改为 `await plugin.destroy?.()`（S-007 / AC#21）。这一改与「逆序串行」是同一次改造，
  不要分两次做——`Promise.all` 换成串行循环时顺手加上可选链
- `init()` 的失败路径要与作用域寿命对齐（S-005 / AC#22）：`#install_plugin()` 今天在 `try` **之外**
  （[:283-285](../../../packages/rxdb/src/RxDB.ts#L283-L285)，注释解释了为什么），catch 里只把
  `#rxdb_initialized` 拨回 `false`。连接纪元作用域一旦在 `init()` 创建，catch 就必须**同时**
  `await this.#connection_scope?.dispose()` 并置空，否则「init 失败 → 修复 → 重新 init」会在一个
  已经装了半套插件的作用域上叠第二套
- 搬 storage 时 `new RxdbFileStorage(...)` **一并**移进 `install(scope)`（D7）：只搬 `defineProperty`
  会在重连时把同一个已 `destroy()` 的实例装回去，泄漏形态变了但没修掉
- 估算：契约 + RxDB 侧 ~180 行（含 `init()` 回滚与 `destroy?.()`）；四个插件迁移各 ~30～60 行
  （workspace 因 D7 的 `readonly` 改造偏上限）；类型契约测试 ~70 行；测试与文档另计

## 实现文件

- `packages/rxdb/src/rxdb-plugin.ts` — `IRxDBPlugin` 契约变更、`lifecycle` 标记与 TSDoc 废弃标注
- `packages/rxdb/src/RxDB.ts` — `#connection_scope`、`#plugin_scopes`、`#install_one_plugin` / `#destroy_plugin` 改造、`repository()` 的 `scope` 形参与私有撤销
- `packages/rxdb/src/__tests__/contracts/plugin-scope-contract.spec.ts` — 成员形状的编译期契约（D4）
- `packages/rxdb-plugin-storage/src/plugin.ts` — 两对配对收进 `install(scope)`，删 `#ownsStorage` / `#registeredEntity`
- `packages/rxdb-plugin-search/src/plugin.ts` — 事件监听器登记改为 `acquire`，删 `#entityEventListeners`
- `packages/rxdb-plugin-graph/src/plugin.ts` — `repository(name, config, scope)` 一次写完，删空 `destroy()`
- `packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts` — 订阅与 `rollback(…)` 改为 `acquire`
- `website/docs/plugins/` · `website/docs/migration/` — 新契约写法与废弃说明
- `requirements/api-baseline/rxdb.json` — 若导出表面确有变化则同步（预期无变化，见 D4）

## References

- [epic-008 生命周期作用域](../../epics/epic-008-lifecycle-scope.md)
- [epic-008 评审建议](../../epic-008-lifecycle-scope-review.md) — R-004～R-007 的来源
- [US-013 LifecycleScope 生命周期作用域原语](US-013-lifecycle-scope-primitive.md) — 前置故事，提供 `LifecycleScope`
- [US-015 插件依赖声明与按需装卸](US-015-plugin-inject-dependency.md) — 后继故事族，收敛安装态语义
- `US-016` 连接纪元作用域与 shutdown 收敛 — 🚧 计划路径 `stories/core/US-016-connection-scope-shutdown.md`，
  **未创建**，且[价值待证](../../epic-008-lifecycle-scope-review-2.md)：本故事交付后 Epic 的三处已知泄漏已全部关闭
- [第二轮评审复核](../../epic-008-lifecycle-scope-review-2.md) — S-004 / S-005 / S-007 是本故事的开工前置
- [versioning-policy.md](../../versioning-policy.md) 第 2、3、4 节 — 公开 API 定义、废弃周期与三层守护
- [epic-007 公开 API 门禁](../../epics/epic-007-public-api-gates.md) — D4 盲区的长期归属
