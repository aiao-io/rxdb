---
id: US-015
title: 插件依赖声明与按需装卸
status: Backlog
priority: Medium
epic: epic-008-lifecycle-scope
created: 2026-08-15
updated: 2026-08-15
tags: [lifecycle, plugin, public-api, dependency]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 依赖 US-014 已把副作用收进作用域；不依赖任何未排期工作
- [x] Negotiable (可协商): 依赖取值范围、重名裁决、失败重试口径三处给了决策表
- [x] Valuable (有价值): 删掉 search 插件整套自建等待状态机；让「远端适配器断开」第一次有可响应的信号
- [x] Estimable (可估算): 一个依赖解析器 + RxDB 侧装卸调度 + search 迁移 + 契约测试
- [x] Small (小): 不含 DI 容器、不含动态服务注册表、不含 #shutdown() 复位收敛
- [x] Testable (可测试): 每条语义都能用「连/断某个适配器后插件作用域的存活状态」断言
-->

# 用户故事：插件依赖声明与按需装卸

## 作为/我想要/以便

**作为** rxdb 插件的作者
**我想要** 声明「我需要什么才能工作」，由宿主决定何时安装我、何时释放我
**以便** 我不必自己写一套「等依赖 → 判断有没有被中途拆掉 → 记录失败态以便重试」的状态机

## 来源与边界

来源是 [epic-008](../../epics/epic-008-lifecycle-scope.md) 「现状」表的第 5、7 项——两套语义不同的
自建安装状态机。它们存在的唯一原因是：**插件无法告诉宿主自己需要什么**，只能在 `install()` 里自己等。

证据最集中的一处是 search 插件：

- [:136](../../../packages/rxdb-plugin-search/src/plugin.ts#L136) 构造期 `assertSupportedAdapter()` 校验**配置**里的适配器名
- [:360](../../../packages/rxdb-plugin-search/src/plugin.ts#L360) 安装期 `await firstValueFrom(this.rxdb.localAdapter$)` 等待适配器**实例**
- [:145](../../../packages/rxdb-plugin-search/src/plugin.ts#L145) `install()` 必须**立刻返回**，真实安装转入后台，否则死锁
- [:370-372](../../../packages/rxdb-plugin-search/src/plugin.ts#L370-L372) 注释写明了死锁的形状：
  「`connect()` 还卡在 `#await_plugin_installs`……都会 `ready()` → 再等 `connect()`，等于等自己」
- [:84](../../../packages/rxdb-plugin-search/src/plugin.ts#L84) 于是有了 `SearchPluginPhase` 五态枚举，
  [:121](../../../packages/rxdb-plugin-search/src/plugin.ts#L121) `ready` 把这套内部状态翻译给使用者

整条链上没有一处是搜索业务——全部是「等一个依赖，同时不要把宿主等死」。这正是宿主该负责的调度。

**第二条证据**：`#plugin_map` 是 `Map<Plugin, IRxDBPlugin>`（[:116](../../../packages/rxdb/src/RxDB.ts#L116)），
键是**工厂函数**。`plugin.name` 全文只出现在三处 `console.error` 的模板串里
（[:711](../../../packages/rxdb/src/RxDB.ts#L711) / :717 / :763）——**从来没有被当作索引用过**。
后果是 search 的工厂只能自己探测宿主实例上的自有属性来判断「我是不是已经装过了」
（[:540-543](../../../packages/rxdb-plugin-search/src/plugin.ts#L540-L543)，
不匹配时抛 `already installed with an incompatible instance`）。要支持按名字声明依赖，
必须先补上这个索引——见决策 D2。

**第三条证据**：`#shutdown()` 只在**最后一个**已连接适配器断开时触发
（[:470-490](../../../packages/rxdb/src/RxDB.ts#L470-L490)）。本地 + 远端都连着、只断远端时，
依赖远端的插件既不会被拆卸也收不到任何通知——今天没有任何机制能表达「我的依赖不在了」。

## 范围边界

### In Scope

- `IRxDBPlugin.inject?: readonly RxDBPluginDependency[]` —— **封闭**取值，不是任意字符串
- 宿主按依赖就绪与否决定安装时机：未就绪不安装，就绪后自动安装（拿到新的子作用域）
- 依赖消失时释放该插件的作用域；依赖重新出现时重新安装
- 依赖顺序与环检测：安装按拓扑序，释放按逆拓扑序
- `#plugin_by_name` 名字索引与重名裁决（D2）
- search 插件迁移：删掉自建等待路径，`SearchPluginPhase` 收敛
- 契约测试 + API 基线同步（本故事**新增导出类型**，与 US-014 不同，基线确实会变）

### Out of Scope

- **依赖注入容器 / `provide()` 式动态服务注册表**——epic-008 明确的非目标
- **任意字符串依赖键**。扩大 `RxDBPluginDependency` 取值范围必须另起故事并说明理由
- **`RxDB.#shutdown()` 的 8 处手工复位收敛**——尚无故事认领
- **拆卸错误在 `RxDB` 边界的出口**——与 [US-014 D4](US-014-plugin-scope-contract.md) 保持一致，仍为 `console.error`
- **重试/退避定时器**。失败不自动重试，只在依赖纪元变化时重来（D3）
- **workspace 的 `#installPromise` / `#installFailed`**：它等的是 IndexedDB 恢复
  （[:331-346](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L331-L346)），
  **不是 rxdb 侧的依赖**，`inject` 帮不上忙。本故事不动它
- **三框架绑定接入**——尚无故事认领

## 验收标准

| #   | 前置条件                                                | 操作                                                                   | 预期结果                                                                                                                                                                                                            | 状态 |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 插件声明 `inject: ['localAdapter']`，尚未 `connect()`   | `init()`                                                               | 该插件**不安装**，不产生作用域，不报错；不声明 `inject` 的插件照常立即安装                                                                                                                                          | ⬜   |
| 2   | 同上                                                    | `connect('local')`                                                     | 本地适配器就绪后该插件自动安装，拿到新的子作用域；安装完成早于 `connect()` resolve                                                                                                                                  | ⬜   |
| 3   | 插件声明 `inject: ['remoteAdapter']`，只连本地          | `connect('local')`                                                     | `connect()` **正常 resolve，不挂起**——`#await_plugin_installs()` 只等已经开始的安装（这条防的正是 [search:370-372](../../../packages/rxdb-plugin-search/src/plugin.ts#L370-L372) 记录的自等死锁）                   | ⬜   |
| 4   | 本地 + 远端均已连接，某插件 `inject: ['remoteAdapter']` | `disconnect('remote')`（本地仍连着，不触发 `#shutdown()`）             | 该插件的作用域被释放；其余插件不受影响；实例本身保留在 `#plugin_map` 中                                                                                                                                             | ⬜   |
| 5   | 承接 AC#4                                               | 重新 `connect('remote')`                                               | 该插件重新安装，拿到**全新**作用域；不出现双份注册与重复监听                                                                                                                                                        | ⬜   |
| 6   | 插件 B `inject: ['search']`（按插件名）                 | `init()` + `connect()`                                                 | 安装顺序为 A(search) → B；释放顺序为 B → A（逆拓扑），且优先于 US-014 的「逆插入序」                                                                                                                                | ⬜   |
| 7   | 两个不同工厂都声明 `name = 'search'`                    | 均 `use()`，且有第三方插件 `inject: ['search']`                        | 按 D2 裁决：重名本身只 `console.warn`（与既有 `use()` 重复告警一致）；**只有当该名字被 inject 时**才抛出「依赖歧义」错误，错误信息列出两个候选                                                                      | ⬜   |
| 8   | 插件声明 `inject: ['nonexistent']`（永不出现的插件名）  | `init()` + `connect()`                                                 | 该插件不安装；`connect()` 正常 resolve；`console.warn` 一次说明「因依赖未满足而未安装」并列出缺失项；**不静默**                                                                                                     | ⬜   |
| 9   | A `inject: ['b']`、B `inject: ['a']`                    | `init()`                                                               | 抛出环检测错误，信息里给出完整环路径（`a → b → a`）；不进入半装状态                                                                                                                                                 | ⬜   |
| 10  | 某插件的延迟安装抛错                                    | 观察后续行为                                                           | 该插件标记为失败且**不自动重试**；其作用域被释放；同纪元内不再尝试；下一次依赖纪元变化（断开再连接）时重新尝试（D3）                                                                                                | ⬜   |
| 11  | search 已迁移                                           | 全量回归                                                               | `search.ready`（[:121](../../../packages/rxdb-plugin-search/src/plugin.ts#L121)）的对外语义**不变**；`SearchPluginPhase` 中 `installing` / `failed` 两态由宿主调度取代；`destroyed` 与 `ready` 若仍需保留则给出理由 | ⬜   |
| 12  | search 已迁移                                           | 检查工厂函数                                                           | [:540-543](../../../packages/rxdb-plugin-search/src/plugin.ts#L540-L543) 探测宿主自有属性的「已装过？」判断改用宿主的名字索引；`incompatible instance` 分支的行为在迁移前后一致                                     | ⬜   |
| 13  | `RxDBPluginDependency` 类型                             | 跑契约测试与 `api-surface.mjs --check`                                 | 契约测试锁住 `inject` 为**只读可选数组**且元素类型受限（传任意字符串**编译失败**）；[rxdb.json](../../api-baseline/rxdb.json) 已同步新增导出                                                                        | ⬜   |
| 14  | 全部改动完成                                            | `pnpm nx run-many -t lint test build --projects=tag:js-lib` 与门禁脚本 | 零 ESLint 警告；`@aiao/rxdb` 四项覆盖率 ≥ **90%**，`rxdb-plugin-search` ≥ **80%**；`pnpm test-all` 通过                                                                                                             | ⬜   |
| 15  | 文档                                                    | 检查插件作者文档                                                       | `inject` 的取值、未满足时的行为、纪元变化导致的重装、以及「不要在 `install()` 里再自己等依赖」的指引已写入 `website/docs/plugins/`                                                                                  | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> **AC#3 是本故事的安全底线。** 今天 `connect()` 会 `await` 全部插件安装
> （[:725-739](../../../packages/rxdb/src/RxDB.ts#L725-L739)）；一旦「安装」变成「等依赖」，
> 而依赖恰好由 `connect()` 自己提供，就会等成死锁——search 已经踩过一次，代价是整个后台安装路径。
> 新调度必须在结构上排除这种可能：**宿主只 await 依赖已满足、因而已经启动的安装**，
> 未满足的插件根本不进入 `#plugin_install_promises`。

## 技术笔记

### 目标契约

```ts
/** 插件可声明的依赖，封闭取值：内置资源名 + 已安装插件名。 */
export type RxDBPluginDependency = 'localAdapter' | 'remoteAdapter' | Uncapitalize<string>;

export interface IRxDBPlugin {
  name: Uncapitalize<string>;
  /** 依赖全部就绪后才会安装；任一依赖消失时作用域被释放。 */
  readonly inject?: readonly RxDBPluginDependency[];
  install(scope: EffectScope): void | Promise<void>;
  /** @deprecated 见 US-014 */
  destroy?(): void | Promise<void>;
}
```

search 迁移后：

```ts
readonly inject = ['localAdapter'] as const;

async install(scope: EffectScope) {
  // 到这里 localAdapter 一定已就绪：不再需要 firstValueFrom、不再需要 phase 机、
  // 也不再需要「立刻返回 + 后台安装」的死锁规避
  const adapter = this.rxdb.localAdapterSync;
  scope.effect(() => bindEntityEvents(adapter), 'search:entityEvents');
  await this.#runInstall(scope, adapter);
}
```

### 依赖纪元

「依赖消失」需要一个可比较的量。沿用 rxdb 已有的信号，不引入新概念：

| 依赖            | 就绪判据                                                               | 纪元值                   |
| --------------- | ---------------------------------------------------------------------- | ------------------------ |
| `localAdapter`  | [`localAdapter$`](../../../packages/rxdb/src/RxDB.ts#L188) 已发出实例  | 当前适配器实例的引用身份 |
| `remoteAdapter` | [`remoteAdapter$`](../../../packages/rxdb/src/RxDB.ts#L205) 已发出实例 | 同上                     |
| `<插件名>`      | 同名插件的作用域处于 active                                            | 该作用域对象的引用身份   |

任一依赖的纪元值发生变化（含变为「不存在」）即触发：释放旧作用域 → 依赖重新齐备时以新作用域重装。
**用引用身份而不是布尔就绪位**，是为了覆盖「适配器换了一个实例但一直非空」的情况——
`#local_adapter_sub` 是 `BehaviorSubject<string>`（[:108](../../../packages/rxdb/src/RxDB.ts#L108)），
只看名字会漏掉同名重建。

### 待冻结的三个决策

#### D1 — 依赖取值范围

| 方案                                    | 主要风险                                                                           | 结论        |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| 只支持 `localAdapter` / `remoteAdapter` | 仓库内四个插件确实只需要这两个；但第三方插件间依赖无从表达，下一个需求马上要改契约 | ❌          |
| 内置资源名 + 已安装插件名（封闭）       | 需要先补名字索引与重名裁决（D2）                                                   | ✅ **推荐** |
| 任意字符串键 + 动态注册表               | 就是 epic-008 明确拒绝的 DI 容器                                                   | ❌          |

#### D2 — 插件重名怎么裁决

`use()` 今天按**工厂函数身份**去重（[:339](../../../packages/rxdb/src/RxDB.ts#L339)），
两个不同工厂声明同一个 `name` 会双双装上且互不知情。按名字 inject 就必须先解决这个歧义。

| 方案                                      | 主要风险                                                                        | 结论        |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| 重名直接抛错                              | 改变既有 `use()` 行为，可能打断今天能跑的组合；为一个还没人用的能力付破坏性代价 | ❌          |
| 重名 `warn`；**被 inject 时**才抛歧义错误 | 歧义只在真正会导致「解析到错误的提供方」时才致命，此时报错信息也最完整          | ✅ **推荐** |
| 重名 warn，按先到先得静默解析             | 「静默选了另一个插件」是最难排查的一类故障                                      | ❌          |

推荐方案的原则是：**在代价真正产生的那一点付费**。重名本身无害（今天就这样跑着），
只有当有人依赖那个名字时它才变成歧义，而那一刻恰好是能给出最有用错误信息的时刻。

#### D3 — 延迟安装失败后的重试口径

| 方案                        | 主要风险                                                                          | 结论        |
| --------------------------- | --------------------------------------------------------------------------------- | ----------- |
| 定时退避重试                | 引入计时器与「重试到第几次算失败」的新语义；失败原因多为配置错误，重试无意义      | ❌          |
| 不自动重试，纪元变化时重来  | 用户想重试必须断开再连接                                                          | ✅ **推荐** |
| 失败即整体 `connect()` 失败 | 与「依赖未就绪不安装」矛盾：延迟安装发生时 `connect()` 可能早已 resolve，无处可抛 | ❌          |

推荐方案与 `#plugin_install_promises` 现有的「失败后删条目允许重试」
（epic-008 现状表第 3 项）语义一致：失败不粘死，但也不自作主张地重来。

### 实现约束

- 依赖解析与调度集中在一处（建议 `packages/rxdb/src/plugin/dependency-scheduler.ts`），
  `RxDB` 只持有它并转发事件；**不要**把纪元比较散进 `#install_one_plugin` / `#destroy_plugin`
- 环检测在**安装规划阶段**做（AC#9），不是等到运行时死锁才发现
- 释放顺序：先按逆拓扑序，同层内再按 US-014 的逆插入序；两条规则的优先级写进 TSDoc
- `#plugin_by_name: Map<string, IRxDBPlugin[]>`——存数组而非单值，重名不丢信息，D2 的歧义错误才能列出全部候选
- 未满足依赖的插件**不得**进入 `#plugin_install_promises`（AC#3）
- 估算：调度器 ~200 行；`RxDB` 侧接入 ~80 行；search 迁移净减约 80 行；契约测试 ~80 行；测试与文档另计

## 实现文件

- `packages/rxdb/src/rxdb-plugin.ts` — `inject` 与 `RxDBPluginDependency`
- `packages/rxdb/src/plugin/dependency-scheduler.ts` — 依赖解析、环检测、纪元比较、装卸调度（新增）
- `packages/rxdb/src/RxDB.ts` — `#plugin_by_name` 索引、调度器接入、`#await_plugin_installs` 收窄
- `packages/rxdb/src/__tests__/contracts/plugin-inject-contract.spec.ts` — `inject` 取值的编译期约束
- `packages/rxdb-plugin-search/src/plugin.ts` — 声明 `inject`，删除自建等待路径与相关相位
- `requirements/api-baseline/rxdb.json` — 新增导出类型，基线同步
- `website/docs/plugins/` — `inject` 的语义与迁移指引

## References

- [epic-008 生命周期作用域](../../epics/epic-008-lifecycle-scope.md)
- [US-013 EffectScope 生命周期作用域原语](US-013-effect-scope-primitive.md)
- [US-014 插件作用域契约](US-014-plugin-scope-contract.md) — 前置故事；本故事的「释放」以它把副作用收进作用域为前提
- [versioning-policy.md](../../versioning-policy.md) 第 4 节 — 三层 API 守护
