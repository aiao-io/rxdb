---
id: US-015
title: 插件依赖声明与按需装卸
status: Backlog
priority: Medium
epic: epic-008-lifecycle-scope
created: 2026-08-15
updated: 2026-08-16
tags: [lifecycle, plugin, public-api, dependency]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 依赖 US-014 已把副作用收进作用域；不依赖任何未排期工作
- [x] Negotiable (可协商): 依赖取值、就绪判据、重名裁决、失败重试四处给了决策表
- [x] Valuable (有价值): 收敛 search 的依赖等待；让局部适配器断开触发依赖插件释放，并以新 adapter epoch 恢复
- [x] Estimable (可估算): 契约已在本文件定死（INV-1～INV-7 与 D1～D5），实现无需再做架构选择
- [ ] Small: 体量偏大——两套就绪判据（适配器引导完成 vs 插件安装完成）、一个拓扑排序器、
      一个环检测器、一套重名裁决，外加 search 迁移。两半的**失败模式完全不同**：适配器侧的
      风险是死锁与释放时序，插件侧的风险是图算法与歧义解析。按「交付阶段」表的 A → B 顺序
      分批交付，每个阶段有独立可验收的 AC 区段；不拆成独立故事文件
- [x] Testable (可测试): 每条不变式都能用「连/断某个适配器后插件作用域的存活状态」断言
-->

# 用户故事：插件依赖声明与按需装卸

## 交付阶段

| 阶段 | 交付                                                                     | 直接前置        | AC 区段   |
| ---- | ------------------------------------------------------------------------ | --------------- | --------- |
| A    | `adapter:local` / `adapter:remote` 依赖、纪元调度、释放时序、search 迁移 | US-014          | AC#1～12  |
| B    | `plugin:*` 依赖、名字索引与重名裁决、拓扑装卸、环检测                    | 阶段 A          | AC#13～18 |
| 横切 | 契约测试、覆盖率门禁与插件作者文档                                       | 阶段 A + 阶段 B | AC#19～20 |

阶段顺序是有向的：阶段 A 先落地调度骨架与适配器这一类依赖，阶段 B 在同一骨架上加入插件间依赖图。
反过来不成立——没有调度器就没有地方接图。

阶段 B **价值待证**：今天没有任何插件声明 `plugin:*` 依赖。若开工时仍无真实消费方，允许只交付
阶段 A 并把本故事置 `In Review`，在此处记录「阶段 B 待第一个 `plugin:*` 消费方出现后再排」，
不得把未实现的图算法计入完成度。

INV-1～INV-7 与 D1～D5 对两个阶段同时生效，是本故事的唯一真相源。

## 作为/我想要/以便

**作为** rxdb 插件的作者
**我想要** 声明「我需要什么才能工作」，由宿主决定何时安装我、何时释放我
**以便** 我不必自己写一套「等依赖 → 判断有没有被中途拆掉 → 记录失败态以便重试」的状态机

## 来源与边界

来源是 [epic-008](../../epics/epic-008-lifecycle-scope.md) 「现状」表的第 5、7 项——两套语义不同的
自建安装状态机，以及当前已经落地但尚未被依赖调度消费的按适配器就绪信号。它们存在的共同问题是：**插件无法把
依赖和作用域交给宿主调度**，只能在 `install()` 里自己等、自己判断竞态。

### 证据一：search 插件的等待链

- [:136](../../../packages/rxdb-plugin-search/src/plugin.ts#L136) 构造期 `assertSupportedAdapter()` 校验**配置**里的适配器名
- [:356-358](../../../packages/rxdb-plugin-search/src/plugin.ts#L356-L358) 安装期等待
  `adapterConnected$(localAdapterName)`，并从 `localAdapter$` 取得实例；按适配器信号已经落地，待阶段 A 把这段
  等待和后续释放纳入宿主调度
- [:139-161](../../../packages/rxdb-plugin-search/src/plugin.ts#L139-L161) `install()` 同步挂完事件通道后
  **返回包住 `#runInstall()` 的 Promise**（:161），因此 `connect()` 确实会等到 FTS 建完。
  ⚠️ :145 的行内注释写着「立刻返回；真实安装……异步执行」，**与代码不符**——真正避开死锁的不是「转入后台」，
  而是下一条的 `bootstrapTransaction`。读这段时以代码为准，改写时见 D2 附
- [:368-370](../../../packages/rxdb-plugin-search/src/plugin.ts#L368-L370) 注释保留了历史死锁形状：
  `adapter.rawQuery` / `repo.find` 会回到 `ready()`，而 `connect()` 正在等待插件安装；当前实现用
  `bootstrapTransaction` 绕开该环，阶段 A 不得把这条用户可见时序改成后台未等待
- [:84](../../../packages/rxdb-plugin-search/src/plugin.ts#L84) 于是有了 `SearchPluginPhase` 五态枚举，
  [:121](../../../packages/rxdb-plugin-search/src/plugin.ts#L121) `ready` 把这套内部状态翻译给使用者

整条链上没有一处是搜索业务——全部是「等一个依赖，同时不要把宿主等死」。这正是宿主该负责的调度。

### 证据二：`plugin.name` 从未被当作索引

`#plugin_map` 是 `Map<Plugin, IRxDBPlugin>`（[:116](../../../packages/rxdb/src/RxDB.ts#L116)），键是**工厂函数**。
`plugin.name` 全文只出现在三处 `console.error` 的模板串里——`#install_one_plugin`、
`#track_plugin_install`、`#destroy_plugin` 各一处（[:725](../../../packages/rxdb/src/RxDB.ts#L725) /
:719 / :771）——**从来没有被当作索引用过**。
后果是 search 的工厂只能自己探测宿主实例上的自有属性来判断「我是不是已经装过了」
（[:538-541](../../../packages/rxdb-plugin-search/src/plugin.ts#L538-L541)，
不匹配时抛 `already installed with an incompatible instance`）。要支持按名字声明依赖，
必须先补上这个索引——见 D4，落地归阶段 B。

### 证据三：部分断连已有信号，但没有依赖释放

`#shutdown()` 只在**最后一个**已连接适配器断开时触发——见 `RxDB.disconnect(adapterName)`
（[:478-486](../../../packages/rxdb/src/RxDB.ts#L478-L486)）。本地 + 远端都连着、只断远端时，
`adapterConnected$('remote')` 会变为 `false`，但依赖远端的插件仍不会被拆卸，也没有新 epoch 调度。

`connected$`（[:219](../../../packages/rxdb/src/RxDB.ts#L219)）仍是聚合 `boolean`，只回答「**有没有**适配器连着」；
阶段 A 不再补信号，而是消费已经存在的按名信号，维护依赖插件的作用域和 adapter epoch。

## 核心不变式（INV）

以下七条对两个阶段同时成立，任一条被违反即视为本 Epic 的目标未达成。

**INV-1 依赖取值封闭。** `inject` 的元素类型必须拒绝任意字符串。写成
`'localAdapter' | 'remoteAdapter' | Uncapitalize<string>` 是**无效的**——见 D1 的类型验证。

**INV-2 就绪 = 可用，不是存在。** 一个依赖只有在**它的消费者可以立即使用它**时才算就绪：
适配器要等引导链跑完（D2），插件要等 `install()` 完成（D3）。「实例已构造」「已注册」都不算。

**INV-3 依赖状态用纪元身份表达，不用布尔位。** 「适配器换了一个新实例但一直非空」必须被识别为
一次依赖变化，否则依赖它的插件会继续挂在已断开的旧实例上。

**INV-4 宿主只 `await` 已经启动的安装。** 依赖未满足的插件**不得**进入 `#plugin_install_promises`。
这是死锁安全底线：`connect()` 会经 `RxDB.#await_plugin_installs()` `await` 全部在册安装
（[:733-748](../../../packages/rxdb/src/RxDB.ts#L733-L748)），
一旦「安装」变成「等依赖」而依赖恰好由 `connect()` 自己提供，就会等成死锁——search 已经踩过一次
（[:370-372](../../../packages/rxdb-plugin-search/src/plugin.ts#L370-L372)），代价是整个后台安装路径。
新调度必须在**结构上**排除这种可能，而不是靠调用方小心。

**INV-5 未满足不静默。** 插件因依赖未满足而未安装时，必须有一次 `console.warn` 说明缺了什么。
「装了但没生效」是最难排查的一类故障。

**INV-6 失败不自动重试。** 安装失败只在**依赖纪元变化**时重来，不引入定时器与退避语义（D5）。

**INV-7 释放先于依赖失效。** 依赖即将消失时，必须先释放依赖方的作用域，再让依赖本身失效。
`disconnect()` 今天已经是这个顺序（[`#shutdown()` 在 :486，`adapter.disconnect()` 在 :489](../../../packages/rxdb/src/RxDB.ts#L484-L489)），
新调度必须保持它——反过来会让 disposer 跑在一个已经断开的适配器上。

## 插件激活状态机

两个阶段共用同一张状态图。宿主为**每个插件实例**维护一个状态，状态只由调度器改写。

```text
                 use()
                   │
                   ▼
             ┌────────────┐   依赖不满足    ┌──────────┐
             │ registered ├───────────────►│ waiting  │
             └─────┬──────┘                └────┬─────┘
                   │ 依赖已满足                  │ 依赖变为满足
                   ▼                            │
             ┌────────────┐◄───────────────────-┘
             │ installing │  ← 已进入 #plugin_install_promises（INV-4）
             └─────┬──────┘
        install 成功│  │ install 抛错
                   ▼  ▼
             ┌────────┐  ┌────────┐
             │ active │  │ failed │ ← 同纪元内不再尝试（INV-6）
             └───┬────┘  └───┬────┘
   依赖纪元变化 / │           │ 依赖纪元变化
   #shutdown()   ▼           ▼
             ┌───────────┐
             │ disposing │ → 作用域释放完毕后回到 waiting 或 registered
             └───────────┘
```

关键约束：

- **只有 `active` 才对外算「依赖已满足」**（INV-2 / D3）。`registered`、`waiting`、`installing`
  都不满足依赖——否则 A `inject: ['plugin:b']` 会在 B 还没装完时就开始安装，
  而 B 提供的属性此刻并不存在
- `waiting` 与 `failed` 的区别是**是否已经试过**：前者会在依赖满足时自动进入 `installing`，
  后者必须等纪元变化
- `disposing → waiting`（依赖没了但插件仍在册）与 `disposing → registered`（整体 `#shutdown()`）
  的区别只在调度器内部，对插件作者不可见

## 调度器采用目标纪元，不照搬 Cordis Fiber

Cordis `Fiber._setEpoch()` / `_reload()` / `_unload()` 的可迁移部分是“最新目标最终胜出”的单飞算法，不是它的
`Context` 或完整宿主模型。RxDB 调度器必须冻结以下行为：

- 每个插件维护一个由依赖实例身份组成的 `targetEpoch`，同一时间最多一个 `install` 或 scope dispose 过渡；
- 依赖在 `install()` 未 settle 时消失：等待该 install settle，释放已经登记的 scope，丢弃该 epoch 的成功结果，不能短暂标记
  `active`；
- `disposing` 期间依赖重新满足或实例替换：旧 dispose 只执行一次，完成后直接 reconcile 最新 `targetEpoch`，不启动中间纪元；
- `failed` 绑定失败时的依赖 epoch；依赖身份和集合不变时不定时重试，只有 epoch 变化才允许再次安装；
- 依赖方的 scope dispose 完成后，宿主才允许让对应适配器真正断开，保持 INV-7。
- **一次变更批量 reconcile 一次**：一次 `connect()` / `disconnect()` 往往同时改变多个依赖名的可用性
  （本地适配器连上时 `adapter:local` 与它带出的若干 `plugin:*` 一起变）。收集受影响的依赖名，
  **一轮**扫描所有插件、算出各自的新 `targetEpoch`，而不是每个名字触发一轮全量重扫——后者在
  N 个名字同时变化时会做 N 次扫描，且中间那几次看到的是**半更新**的依赖视图，可能安装一个
  下一毫秒就要拆掉的插件。cordis 的 `ReflectService.notify(names[])` 收一个名字数组、
  只跑一遍就是这个形状（cordis `packages/core/src/reflect.ts:205-227`）。
- **只在「可用 ↔ 不可用」的跨越边上通知**：依赖状态在 `waiting` / `installing` / `failed` 之间
  怎么流转都不构成依赖方的输入变化——依赖方只关心「这个名字现在能不能用」。因此 reconcile
  只在插件**进入或离开 `active`** 时才把它的名字放进受影响集合。少了这条过滤，
  `installing → active` 与 `failed → waiting` 这类内部跃迁会激起整轮无效重扫；在插件互相依赖时
  还会级联放大。cordis 的 `_updateState` 正是先判 `ACTIVE` 边、只在边上才 `notify`
  （`packages/core/src/fiber.ts:362-368`）。

这组约束比“增加更多状态名”更重要。实现可以继续使用本故事的
`registered / waiting / installing / active / failed / disposing`，但状态只能由 reconcile loop 改写，不能让插件包各自
维护第二套标志位。

### 必须加入的并发测试

1. install 延迟期间断开依赖：install settle 后 scope 释放一次，插件不进入 `active`。
2. dispose 延迟期间重新连接同名但新实例：旧 dispose 一次，跳过中间 epoch，只安装新实例。
3. 失败后依赖不变不重试；断开再连接或适配器实例替换后恰好重试一次。
4. 同一插件重复 disconnect / reconnect 不重复注册事件；scope disposer 逆序、幂等、异步释放。
5. 一次 `connect()` 同时满足多个依赖名：reconcile 扫描**只跑一轮**，每个插件的 `install()`
   至多被调用一次（断言扫描次数，不只断言最终态——最终态在 N 轮扫描下同样正确，掩盖了做无用功）。
6. 某插件在 `waiting` / `installing` / `failed` 之间跃迁：**不**触发依赖它的插件的 reconcile；
   只有它进入或离开 `active` 才触发。

事件注册应沿用 Epic 008 的账本收敛方向：`RxDB.addEventListener()` 和 `@aiao/utils` 的
`EventDispatcher.addEventListener()` 返回幂等 remover，重复 listener 继续保持 `Set` 的单条目语义（重复调用返回空操作
disposer），阶段 A 与阶段 B 通过 `scope.acquire()` 登记；保留现有 `removeEventListener()` 兼容调用。不得引入 Cordis
`Context`、Proxy trace、全局 Registry、thenable Fiber 或 HMR。

## 待冻结的五个决策

### D1 — 依赖取值范围与写法

| 方案                                                        | 主要风险                                                                                | 结论        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- |
| 只支持两个适配器名                                          | 仓库内四个插件确实只需要这两个；但第三方插件间依赖无从表达，下一个需求马上要改契约      | ❌          |
| `'localAdapter' \| 'remoteAdapter' \| Uncapitalize<string>` | **类型上等于没约束**：`Uncapitalize<string>` 接受任何小写开头的串，前两个成员被完全吸收 | ❌          |
| 前缀命名空间的封闭联合                                      | 写法比裸名长；旧写法（若已有人用）需要迁移                                              | ✅ **推荐** |

推荐取值：

```ts
export type RxDBPluginDependency = 'adapter:local' | 'adapter:remote' | `plugin:${Uncapitalize<string>}`;
```

用 `tsc --strict` 实测过的性质（对应阶段 B 的契约测试）：

| 写法                   | 是否接受 | 说明                                              |
| ---------------------- | -------- | ------------------------------------------------- |
| `'adapter:local'`      | ✅       | 内置资源                                          |
| `'plugin:search'`      | ✅       | 插件名                                            |
| `'search'`             | ❌       | 裸名不属于封闭取值——正是被吸收方案漏掉的一类      |
| `'whatever'`           | ❌       | 任意字符串被拒绝                                  |
| `'plugin:Search'`      | ❌       | 大写开头永远匹配不上 `name: Uncapitalize<string>` |
| `const s: string` 赋值 | ❌       | 非字面量被拒绝                                    |

注意最后收窄到 `` `plugin:${Uncapitalize<string>}` ``（而非 `` `plugin:${string}` ``）：
后者会放行 `'plugin:Search'`，而 `name` 的类型是 `Uncapitalize<string>`，
这个依赖**在运行时永远无法被满足**——能在编译期拦掉就不要留到运行时 warn。

前缀还留出了将来加入 `'adapter:*'` 之外资源类别的余地（例如假想的 `'storage:*'`），
新增类别时是**扩大**联合而非改写既有成员。

### D2 — 适配器「就绪」的判据

这条是本 Epic 最容易写错的一处，必须钉死。

**`localAdapter$` 发出实例 ≠ 适配器可用。** 该 Observable 的
`switchMap` 只调用 `getAdapter()`（[:193-195](../../../packages/rxdb/src/RxDB.ts#L193-L195)），
而 `getAdapter()` 只跑工厂、把实例塞进 `#adapter_map`，**不调用 `connect()`、不建表、不跑迁移**。
代码库自己在 `#connected_adapters` 的 `@remarks` 里写明了这件事
（[:163-168](../../../packages/rxdb/src/RxDB.ts#L163-L168)）：
「`localAdapter$` / `remoteAdapter$` 的订阅会经 `getAdapter` 把从未 `connect()` 的适配器也塞进去」。

真正的就绪点在 `connect()` 里，是这条链**全部**跑完之后：

```text
adapter.connect()                    :432
  → migrateSystemSchema?()           :440 / :450   ┐
  → startWriterLease?()              :441 / :451   │ 仅 local 分支（:433 isLocalAdapter）
  → #runMigrations() / createTables  :442 / :449   │
  → #ensureEntityTables()            :443          │
  → reconcileEntityIndexes?()        :453          ┘
  → #set_adapter_connected(name)     :457   ← 就绪
  → #adapter_connected_sub.next()    :595
  → #await_plugin_installs()         :459
```

| 方案                                | 主要风险                                                                  | 结论            |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------- |
| 以 `localAdapter$` 发出为就绪       | 插件会在**建表与迁移之前**拿到适配器；search 的索引建在不存在的表上       | ❌              |
| 以 `connected$` 为真为就绪          | 它是全局布尔，「远端连着、本地没连」时对 `adapter:local` 给出**假的**就绪 | ❌              |
| 以 `#connected_adapters` 含该名为准 | 已由 `adapterConnected$(adapterName)` 分发；阶段 A 需要消费并绑定 epoch   | ✅ **现有实现** |

[`#set_adapter_connected()` 在 :590-597、`#await_plugin_installs()` 在 :459](../../../packages/rxdb/src/RxDB.ts#L590-L597)——**就绪信号先于插件安装等待点发生**，
所以这个判据不会引入新的死锁窗口（INV-4 依然成立）。

Search 当前已经去掉聚合 `connected$`，等待按名的 `adapterConnected$(localAdapterName)` 后再从
`localAdapter$` 取得实例。后者只负责取实例，不能被重新解释为 readiness；阶段 A 的宿主调度应把这两个动作放进同一
个依赖 epoch，并负责局部断连时的释放与重装。

信号本身已落地；剩余的依赖释放、epoch reconcile 和 search 生命周期迁移归阶段 A。

#### D2 附 — `install()` 内允许调用什么（阶段 A 的硬约束）

改写 search 的等待链时**不得**顺手把 FTS DDL 挪出 `install()` 返回的 Promise。今天
[`install()`](../../../packages/rxdb-plugin-search/src/plugin.ts#L143-L150) 返回的 Promise 包含
`#runInstall()`，而 `connect()` 会 `await` 它——**`await db.connect()` 返回即 FTS 可用是用户可见保证**，
把它挪到连接 Promise 之外是行为回退，不是重构。

约束因此是：`install()` 内只允许走
[`bootstrapTransaction` / `rawQuery`](../../../packages/rxdb-plugin-search/src/plugin.ts#L368-L375)
这条不回头等 `connect()` 的路径，**不改对外时序**。原因写在源码注释里：`repo.find()` /
`adapter.rawQuery()` 都会先 `ready()`，而 `ready()` 又等 `connect()`——等于等自己。
「另开一个不进 `#await_plugin_installs()` 的慢路径钩子」这一方案已被否决：它要绕开的那个环今天不存在
（`connect()` 先置位 `connected$` 再 `await` 插件安装），而把 FTS 挪出连接 Promise 会破坏
「`await db.connect()` 返回即 FTS 可用」这条用户可见保证。

### D3 — 插件依赖的就绪判据

| 方案                           | 主要风险                                                                            | 结论        |
| ------------------------------ | ----------------------------------------------------------------------------------- | ----------- |
| 同名插件**已注册**即算满足     | A 会在 B 的 `install()` 还没跑完时开始安装，而 B 注入的属性此刻不存在——依赖形同虚设 | ❌          |
| 同名插件**已开始安装**即算满足 | 同上，只是窗口更窄；异步 `install()` 下仍然必然踩中                                 | ❌          |
| 同名插件处于 **`active`**      | 需要维护完整状态机（见上）；串行化程度更高，安装总时长可能变长                      | ✅ **推荐** |

「安装总时长变长」是这里**唯一**的代价，而且它是必需的：依赖关系本来就是串行约束。
无依赖的插件之间照旧并行安装。

### D4 — 插件重名怎么裁决

`use()` 今天按**工厂函数身份**去重（[:339](../../../packages/rxdb/src/RxDB.ts#L339)），
两个不同工厂声明同一个 `name` 会双双装上且互不知情。按名字 inject 就必须先解决这个歧义。

| 方案                                      | 主要风险                                                                        | 结论        |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| 重名直接抛错                              | 改变既有 `use()` 行为，可能打断今天能跑的组合；为一个还没人用的能力付破坏性代价 | ❌          |
| 重名 `warn`；**被 inject 时**才抛歧义错误 | 歧义只在真正会导致「解析到错误的提供方」时才致命，此时报错信息也最完整          | ✅ **推荐** |
| 重名 warn，按先到先得静默解析             | 「静默选了另一个插件」是最难排查的一类故障（违反 INV-5）                        | ❌          |

推荐方案的原则是：**在代价真正产生的那一点付费**。重名本身无害（今天就这样跑着），
只有当有人依赖那个名字时它才变成歧义，而那一刻恰好是能给出最有用错误信息的时刻。

落地归阶段 B。

### D5 — 依赖满足后安装失败的重试口径

| 方案                        | 主要风险                                                                          | 结论        |
| --------------------------- | --------------------------------------------------------------------------------- | ----------- |
| 定时退避重试                | 引入计时器与「重试到第几次算失败」的新语义；失败原因多为配置错误，重试无意义      | ❌          |
| 不自动重试，纪元变化时重来  | 用户想重试必须断开再连接                                                          | ✅ **推荐** |
| 失败即整体 `connect()` 失败 | 与「依赖未就绪不安装」矛盾：延迟安装发生时 `connect()` 可能早已 resolve，无处可抛 | ❌          |

推荐方案与 `#plugin_install_promises` 现有的「失败后删条目允许重试」
（epic-008 现状表第 3 项）语义一致：失败不粘死，但也不自作主张地重来。

**与 US-014 AC#12～#15 的关系**：那一组说的是「安装失败时已登记的资源要被回收、失败的作用域不复用」，
是**资源语义**；本决策说的是「回收之后由什么事件触发再试一次」，是**调度语义**。
两者在「下一次纪元重来」这一点上**故意重合**（US-014 AC#15 已经这样写），
本决策只是把「除了纪元变化之外不再有别的触发源」补成封闭规则——不得引入定时器或退避。

## 范围边界

以下对两个阶段同时生效。

### Out of Scope

- **依赖注入容器 / `provide()` 式动态服务注册表**——epic-008 明确的非目标
- **任意字符串依赖键**。扩大 `RxDBPluginDependency` 取值必须另起故事并说明理由（INV-1）
- **`RxDB.#shutdown()` 的 8 处手工复位收敛**——归 `US-016`（🚧 文件未创建，价值已证，待切片）
- **拆卸错误在 `RxDB` 边界的出口**——与 [US-014 D5](./US-014-plugin-scope-contract.md) 保持一致，仍为 `console.error`
- **workspace 的 `#installPromise` / `#installFailed`**：它等的是 IndexedDB 恢复
  （[:331-346](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L331-L346)），
  **不是 rxdb 侧的依赖**，`inject` 帮不上忙。两个阶段都不动它
- **三框架绑定接入**——归 `US-017`（🚧 文件未创建，价值待证）

## 目标契约

```ts
/** 插件可声明的依赖，封闭取值：内置资源 + 已安装（`active`）插件名。 */
export type RxDBPluginDependency = 'adapter:local' | 'adapter:remote' | `plugin:${Uncapitalize<string>}`;

export interface IRxDBPlugin {
  name: Uncapitalize<string>;
  readonly lifecycle?: 'scoped';
  /** 依赖全部就绪后才会安装；任一依赖的纪元变化时作用域被释放。就绪判据见 US-015 的 D2 / D3。 */
  readonly inject?: readonly RxDBPluginDependency[];
  install(scope: LifecycleScope): void | Promise<void>;
  /** @deprecated 见 US-014 */
  destroy?(): void | Promise<void>;
}
```

search 迁移后：

```ts
readonly inject = ['adapter:local'] as const;

async install(scope: LifecycleScope) {
  // 到这里 adapter:local 一定已就绪（引导链跑完，见 D2）：不再需要 adapterConnected$ 等待、
  // 不再需要 phase 机。install() 内仍只走 bootstrapTransaction / rawQuery，对外时序不变
  const adapter = this.rxdb.localAdapterSync;
  scope.effect(() => bindEntityEvents(adapter), 'search:entityEvents');
  await this.#runInstall(scope, adapter);
}
```

## 验收标准

### 阶段 A — 适配器依赖与纪元调度（AC#1～12）

| #   | 前置条件                                                 | 操作                                                       | 预期结果                                                                                                                                                                                                    | 状态 |
| --- | -------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 插件声明 `inject: ['adapter:local']`，尚未 `connect()`   | `init()`                                                   | 该插件**不安装**，不产生作用域，不报错；不声明 `inject` 的插件照常立即安装                                                                                                                                  | ⬜   |
| 2   | 同上                                                     | `connect('local')`                                         | 引导链（迁移、建表、索引 reconcile）全部跑完后该插件才安装（D2），拿到新的子作用域；安装完成早于 `connect()` resolve                                                                                        | ⬜   |
| 3   | 插件声明 `inject: ['adapter:remote']`，只连本地          | `connect('local')`                                         | `connect()` **正常 resolve，不挂起**——`#await_plugin_installs()` 只等已经开始的安装（INV-4，防的正是 [search:370-372](../../../packages/rxdb-plugin-search/src/plugin.ts#L370-L372) 记录的自等死锁）        | ⬜   |
| 4   | 本地 + 远端均已连接，某插件 `inject: ['adapter:remote']` | `disconnect('remote')`（本地仍连着，不触发 `#shutdown()`） | 该插件的作用域被释放；其余插件不受影响；实例本身保留在 `#plugin_map` 中；释放完成早于 `adapter.disconnect()`（INV-7）                                                                                       | ⬜   |
| 5   | 承接 AC#4                                                | 重新 `connect('remote')`                                   | 该插件重新安装，拿到**全新**作用域；不出现双份注册与重复监听                                                                                                                                                | ⬜   |
| 6   | 适配器被替换为**同名新实例**，中途从未变为空             | 观察依赖方                                                 | 调度器按实例引用身份识别为一次纪元变化（INV-3），释放旧作用域并以新实例重装；只看名字或布尔位的实现会漏掉这一条                                                                                             | ⬜   |
| 7   | 插件 `install()` 挂起期间依赖被断开（并发测试 1）        | 等 `install()` settle                                      | 已登记的 scope 恰好释放一次；插件**不进入 `active`**；该纪元的成功结果被丢弃                                                                                                                                | ⬜   |
| 8   | `disposing` 期间依赖以新实例回来（并发测试 2）           | 观察调度                                                   | 旧 dispose 只执行一次，直接 reconcile 到最新 `targetEpoch`，不启动中间纪元，只安装新实例                                                                                                                    | ⬜   |
| 9   | 某插件的延迟安装抛错（并发测试 3）                       | 依赖不变时观察；再断开并重连                               | 失败绑定当时的依赖 epoch，作用域被释放，同纪元内**不自动重试**（INV-6 / D5）；纪元变化后**恰好**重试一次                                                                                                    | ⬜   |
| 10  | 同一插件重复 `disconnect` / `connect`（并发测试 4）      | 观察事件注册与 disposer                                    | 不重复注册事件（幂等 remover 保持 `Set` 单条目语义）；scope disposer 逆序、幂等、异步释放                                                                                                                   | ⬜   |
| 11  | 插件 `inject: ['adapter:remote']`，远端永不连接          | `init()` + `connect('local')`                              | 该插件不安装；`connect()` 正常 resolve；`console.warn` **一次**说明「因依赖未满足而未安装」并列出缺失项；**不静默**（INV-5）                                                                                | ⬜   |
| 12  | search 已迁移到 `inject: ['adapter:local']`              | 全量回归                                                   | `search.ready`（[:121](../../../packages/rxdb-plugin-search/src/plugin.ts#L121)）对外语义不变；`await db.connect()` 返回即 FTS 可用（D2 附）；`SearchPluginPhase` 的 `installing` / `failed` 由宿主调度取代 | ⬜   |

### 阶段 B — 插件间依赖图（AC#13～18）

| #   | 前置条件                                           | 操作                                                   | 预期结果                                                                                                                                                                                                                                     | 状态 |
| --- | -------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 13  | 插件 B `inject: ['plugin:search']`                 | `init()` + `connect()`                                 | 安装顺序为 search → B，且只有 search 处于 `active` 时 B 才开始安装（D3）；释放顺序为 B → search（逆拓扑），优先于 US-014 的逆插入序                                                                                                          | ⬜   |
| 14  | 两个不同工厂都声明 `name = 'search'`               | 均 `use()`，且有第三方插件 `inject: ['plugin:search']` | 按 D4 裁决：重名本身只 `console.warn`；**只有当该名字被 inject 时**才抛出「依赖歧义」错误，错误信息列出全部候选                                                                                                                              | ⬜   |
| 15  | 插件声明 `inject: ['plugin:nonexistent']`          | `init()` + `connect()`                                 | 该插件不安装；`connect()` 正常 resolve；`console.warn` 一次列出缺失项（INV-5）                                                                                                                                                               | ⬜   |
| 16  | A `inject: ['plugin:b']`、B `inject: ['plugin:a']` | `init()`                                               | 在**安装规划阶段**抛出环检测错误，信息给出完整环路径（`a → b → a`）；不进入半装状态，不等到运行时死锁才发现                                                                                                                                  | ⬜   |
| 17  | 宿主已建立 `#plugin_by_name` 索引                  | 检查索引结构与 search 工厂                             | 索引为 `Map<string, IRxDBPlugin[]>`（存数组，重名不丢信息，D4 的歧义错误才能列出全部候选）；search [:538-541](../../../packages/rxdb-plugin-search/src/plugin.ts#L538-L541) 的自有属性探测改用宿主索引，`incompatible instance` 分支行为不变 | ⬜   |
| 18  | `RxDBPluginDependency` 完整取值                    | 跑契约测试                                             | D1 表中六种写法的编译期结果逐条成立，尤其 `'search'` 裸名与 `'plugin:Search'` 大写开头**编译失败**                                                                                                                                           | ⬜   |

### 横切（AC#19～20）

| #   | 前置条件     | 操作                                                                   | 预期结果                                                                                                                                                          | 状态 |
| --- | ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 19  | 全部改动完成 | `pnpm nx run-many -t lint test build --projects=tag:js-lib` 与门禁脚本 | 零 ESLint 警告；`@aiao/rxdb` 四项覆盖率 ≥ **90%**，`rxdb-plugin-search` ≥ **80%**；[rxdb.json](../../api-baseline/rxdb.json) 已同步新增导出；`pnpm test-all` 通过 | ⬜   |
| 20  | 文档         | 检查插件作者文档                                                       | `inject` 的取值、未满足时的行为、纪元变化导致的重装，以及「不要在 `install()` 里再自己等依赖」的指引已写入 `website/docs/plugins/`                                | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 实现约束

- 依赖解析与调度集中在一处（建议 `packages/rxdb/src/plugin/dependency-scheduler.ts`），`RxDB` 只持有它
  并转发事件；**不要**把纪元比较散进 `#install_one_plugin` / `#destroy_plugin`
- 状态只能由 reconcile loop 改写，不得让插件包各自维护第二套标志位
- 环检测在**安装规划阶段**做（AC#16），不是等到运行时死锁才发现
- 释放顺序：先按逆拓扑序，同层内再按 US-014 的逆插入序；两条规则的优先级写进 TSDoc
- 未满足依赖的插件**不得**进入 `#plugin_install_promises`（AC#3 / INV-4）
- 阶段 A 不得为了简化调度而把 search 的 FTS DDL 挪出 `install()` 返回的 Promise（D2 附）

## 实现文件

| 路径                                                                   | 阶段  | 用途                                                      |
| ---------------------------------------------------------------------- | ----- | --------------------------------------------------------- |
| `packages/rxdb/src/rxdb-plugin.ts`                                     | A     | `inject` 与 `RxDBPluginDependency`                        |
| `packages/rxdb/src/plugin/dependency-scheduler.ts`                     | A / B | A 落调度骨架、纪元比较与装卸；B 加拓扑排序与环检测        |
| `packages/rxdb/src/RxDB.ts`                                            | A / B | A 接入调度器、收窄 `#await_plugin_installs`；B 加名字索引 |
| `packages/rxdb/src/__tests__/contracts/plugin-inject-contract.spec.ts` | A / B | `inject` 取值的编译期约束                                 |
| `packages/rxdb-plugin-search/src/plugin.ts`                            | A / B | A 声明 `inject` 并删自建等待路径；B 改用宿主名字索引      |
| `requirements/api-baseline/rxdb.json`                                  | 横切  | 新增导出类型，基线同步                                    |
| `website/docs/plugins/`                                                | 横切  | `inject` 的语义与迁移指引                                 |

## References

- [epic-008 生命周期作用域](../../epics/epic-008-lifecycle-scope.md)
- [US-013 LifecycleScope 生命周期作用域原语](./US-013-lifecycle-scope-primitive.md)
- [US-014 插件作用域契约](./US-014-plugin-scope-contract.md) — 前置故事；「释放」以它把副作用收进作用域为前提
- [versioning-policy.md](../../versioning-policy.md) 第 4 节 — 三层 API 守护
