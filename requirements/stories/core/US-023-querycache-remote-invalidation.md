---
id: US-023
title: QueryCache 远端变更的失效上报口与实时同步
status: Done
priority: High
epic: epic-004-future-features
created: 2026-08-27
updated: 2026-08-27
tags: [core, querycache, realtime, invalidation, sse, http]
inherited_acs:
  - from: US-212
    ac: 29
    note: 2026-08-24 owner 判定「拿不到 owner」移出 US-212，登记进 roadmap「明确不排期」；其解锁条件已满足，见「解锁条件核对」
---

<!--
INVEST 检查清单:
- [x] Independent: 阶段 A 只动 core 的失效路径，不依赖 US-021 / US-022 / US-215
- [x] Negotiable: 上报口的方法名、事件名、SSE 事件体字段、合流窗口的实现手段可议；「粒度=整实体」「不推行数据」「先清记忆后重跑」「记忆认代次」不可议（D1 / D8 / D2 / D12）
- [x] Valuable: 今天两个客户端改同一份数据，谁也看不见谁——本仓库最像 local-first 却最不 live 的一条路径
- [x] Estimable: 1 个 core 入口 + 1 个事件（连带 devtools 清单）+ 三处既有类的方法（记忆代次 / 在飞作废 / 任务选取）+ 适配器内一条连接 + demo 广播与两页面 e2e
- [x] Small: 分三阶段，每阶段单迭代可完成
- [x] Testable: 阶段 A 用替身可全覆盖；阶段 C 的双页面收敛是可自动化的终局证据
-->

# 用户故事：QueryCache 远端变更的失效上报口与实时同步

## 作为/我想要/以便

**作为** 用 `SyncType.QueryCache` 连同一个后端的多个客户端中的一个
**我想要** 别人改了数据之后，我屏幕上的列表自己跟上
**以便** 不必靠刷新页面、切筛选条件或者干等下一次查询才知道数据已经变了

## 问题现状

### 病灶：两个窗口，一份数据，谁也看不见谁

打开两个 [dev-rxdb-http](../../../apps/dev-rxdb-http/) 窗口 A 与 B，在 A 里改一条 recipe。
B 的列表**永远**停在旧值——不是延迟几秒，是没有任何机制会让它动。
用户能拿到新值的唯一办法是自己去戳一下：刷新页面、翻页、改筛选条件。

demo 里那个 `refetch()` 就是这件事留下的疤：

```ts
/** 让列表重新查一次（换一个等价但不同身份的筛选对象即可触发）。 */
refetch(): void {
  this.$appliedFilter.update(state => ({ ...state }));
}
```

它靠**换一个内容相同、身份不同的筛选对象**来骗过 `useFind` 的依赖比较。
一个响应式数据库的 demo 需要伪造一次依赖变化才能重查，这本身就是判词。

### 断在三层，且每一层都是结构性的

| 层         | 现状                                                                                                                                                 | 证据                                                                                        |
| :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| 适配器契约 | `RxDBAdapterRemoteBase` 的抽象成员是 `pullChanges` / `getChangeCount` / `mergeChanges` / `fetchMetadata` / `findByIds`——**清一色由客户端发起的拉取** | [rxdb-adapter.ts](../../../packages/rxdb/src/rxdb-adapter.ts)                               |
| 失效状态   | `QueryCacheSyncMemo` 的三条失效路径（窗口到期 / 本仓储写 / 换适配器实例）全部由 core 内部触发，`clear()` 无对外出口，实例由 `Repository` 私有持有    | [query-cache-sync-memo.ts](../../../packages/rxdb/src/repository/query-cache-sync-memo.ts)  |
| 查询重跑   | `QueryManager` 只 `addEventListener` 了 `ENTITY_LOCAL_CREATE / UPDATE / REMOVE` 三个**本地**事件                                                     | [QueryManager.ts](../../../packages/rxdb/src/repository/QueryManager.ts) `#init_db_changes` |

三层各自独立成立，所以**补任何一层都不够**：给适配器加订阅口而不给 core 失效入口，收到的通知无处可去；
给 core 加失效入口而不清记忆，重跑会在窗口内命中 memo、跳过同步、读回同一份陈旧本地行。

### 远端事件今天只喂一个角标

`ENTITY_REMOTE_CREATE / UPDATE / REMOVE` 三个事件类是存在的，但全仓库唯一的消费者是
[version/sync-listeners.ts](../../../packages/rxdb/src/version/sync-listeners.ts) 的 `makeRemoteHandler`，
它做的事只有一件：`historyManager.incrementPullableCount(count)`。而 `pullableCount$` 的自述是
「远端还有多少条没拉下来」（[pullable-count.ts](../../../packages/rxdb/src/version/pullable-count.ts)）——
一个**给 UI 看的角标**，不触发任何查询。

这条链在 supabase 上是通的：`handle_supabase_change` 收到 `postgres_changes` 后
`rxdb.dispatchEvent(new EntityRemoteUpdatedEvent(...))`。所以本仓库已经有一条完整的实时通道，
**它的终点却是一个计数器**。QueryCache 侧连这条通道都没有。

### 「派发一个本地事件」不是出路

[US-212 的 owner 判定](../adapter/US-212-http-adapter.md)已经把这条路堵死，判词照抄：

> `RxDB.dispatchEvent()` 是公开方法，所以适配器**在物理上**能派发那三个事件——但那是错的两次：
> 一是拿「本地写发生了」冒充「远端变了」，二是它清不掉 `syncMemo`。

本故事要补的正是那句「真正需要的是一个 core 新抽象」。

### 复验方式

源码实证（上表三处 + `sync-listeners.ts` 的唯一消费者由 `grep -rn "ENTITY_REMOTE_" packages/rxdb/src` 核过），
症状实证（两个浏览器窗口，任一写入操作）。

## 解锁条件核对

roadmap 的[「明确不排期」](../../roadmap.md#明确不排期)对本条写的解锁条件是两句，逐句核对：

| 解锁条件                 | 是否满足 | 依据                                                                             |
| :----------------------- | :------- | :------------------------------------------------------------------------------- |
| 出现一个真实的实时性需求 | ✅       | 用户对 [US-214](../adapter/US-214-http-browser-demo.md) 的 demo 直接报了这个缺口 |
| 能说清失效粒度           | ✅       | **整实体**，理由与被否掉的另两种粒度见 D1                                        |

「价值待证」的[判据是病灶数 ≥ 抽象数](../../CONVENTIONS.md)，一并核算：

- **抽象数 = 1**——core 的失效上报口。阶段 B 不加适配器契约成员（D4），阶段 C 是 demo 与协议可选端点，都不新增 core 抽象。
  三处**不算进抽象数但必须说出来**的改动，免得这笔账看起来比实际干净：`QueryManager` 会多两个内部公开方法（D2：一个问依赖、一个按依赖重跑）、
  `QueryCacheSyncMemo` 会多一个代次参数（D12）、`QueryCacheRepository` 会多一个作废在飞查询的方法（D13）。
  三者都是既有类的方法，不引入新概念、不进公共 API 契约面，因此不构成新抽象——但它们是真实的实现面，
  「1 个入口」不等于「改 1 个文件」。
- **病灶数 = 1**——「别的客户端改了，本客户端永不更新」。它可复现、可自动化，且今天**产生错误结果**（屏幕上是过期数据），
  而不是 2026-08-24 判定时说的「只是没有实时性」。判定当时那句话成立的前提是没人盯着屏幕等，现在这个前提没了。

1 ≥ 1，成立。本故事关闭时须把 roadmap 那一行从「明确不排期」移出并指向本文件。

## 范围边界

### In Scope

- core：一个**远端变更失效上报口**，语义是「远端的某个实体变了，你手上的东西不新鲜了」
- 该入口的动作与顺序都不可议：**同步**清掉同步记忆与在飞查询 → **合流后**重跑受影响的活查询（D2 / D13 / D14）
- 依赖扩散按既有的 `depEntityTypeMap` / `relationEntityTypes`，关系查询一并覆盖（D1）
- `@aiao/rxdb-adapter-http`：一条**可选**的变更通知连接（SSE），缺省关闭
- 自回声抑制、断线重连、重连后的全量失效（D6 / D7）
- `http-protocol.md` 新增「变更通知（可选）」一节
- demo 后端广播 + 前端开关 + 两页面收敛的 e2e

### Out of Scope

- **不推行数据**——通知只说「变了」，不说「变成什么」（D8）
- **不做轮询降级**：SSE 连不上就是连不上，报诊断信号，不偷偷切一条二等通道（D5）
- **不做断线补发**（`Last-Event-ID` / 服务端变更日志）——那要求后端保留 changelog，与 QueryCache「无 changelog」的定位冲突；用「重连即全量失效」代替（D7）
- 不动 `SyncType.Full` / 版本化路径的任何行为，特别是不碰 `pullableCount`
- 不做 `where` 指纹级或 id 集合级的失效（D1 已判定否决，不是留待将来）
- 不新增框架侧 API：三端 `useFind` 一行不改就该拿到实时性（AC#11）
- 不做 [US-212 AC#30 的行缓存 eviction](../../roadmap.md#明确不排期)——那条的解锁条件是另一个症状，与本故事无关
- **不治本地写路径的在飞窗口**：`create` / `update` / `remove` 今天只清记忆、不动在飞表，理论上有与 D13 同款的窗口，
  但那是 US-020 的既有行为、有既有用例锁着，在本故事顺手改它属于夹带（D13 末段）

## 交付阶段

| 阶段 | 范围                       | 关闭判据                                                |
| :--- | :------------------------- | :------------------------------------------------------ |
| A    | core 失效上报口            | AC#1–#11、#26–#31，用测试替身即可全绿，不依赖任何适配器 |
| B    | HTTP 适配器变更通知通道    | AC#12–#19，包内单测 + `http-protocol.md` 新一节         |
| C    | demo 后端广播 + 双页面 e2e | AC#20–#24，两个真实浏览器页面自动收敛                   |

阶段 A **不得单独关闭故事**。一个没有调用方的失效入口正是
[US-015 阶段 B 被移出时的那句判词](../../roadmap.md#明确不排期)——「为一个不存在的依赖图准备」。
它的正当性来自阶段 C 的双页面收敛，所以三阶段一并验收。

## 设计决策

### D1 — 失效粒度 = 整实体，扩散按既有依赖表

roadmap 点名要求说清粒度。三选一，逐个算账：

| 粒度         | 判定 | 理由                                                                                                                                  |
| :----------- | :--- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `where` 指纹 | 否决 | 服务端不知道客户端在查什么。要它知道，就得把每个客户端的 `where` 上传注册——把一个无状态 HTTP 后端改造成有状态订阅服务器，代价远超收益 |
| id 集合      | 否决 | 见下                                                                                                                                  |
| **整实体**   | 采纳 | QueryCache 的同步单元本来就是**整个 `where`**（`fetchMetadata(entityName, where)`），实体级失效与它天然同构                           |

**id 集合被否决的理由是它省不掉那次往返。** 客户端拿到「id X 变了」之后仍然回答不了唯一要紧的问题：
X 是否落在我的 `where` 里、以及**有没有别的行因为这次变更新进入了我的 `where`**。后半句本地判定不了——
远端权威、服务端过滤，这正是 `fetchMetadata` 存在的理由。于是 id 集合既避不开那次 metadata 请求，
又新增一个必须由服务端保证正确的契约，还会诱导实现者去做本地行直写（D8 明确反对）。

**整实体的代价是可算的**：每个受影响的活查询一次 `fetchMetadata`，响应体只有 `{id, updatedAt}`；
`diffMetadata` 之后若无变化，`#pull` 一行都不拉、`findByIds` 一次都不发（AC#4 钉住这条）。

**扩散不是新机制**：`QueryTask` 已经把 `relationEntityTypes` 登记进 `QueryManager` 共享的 `depEntityTypeMap`，
`#init_db_changes` 的本地事件过滤用的就是它。远端失效沿同一张表扩散，关系查询因此自动覆盖。

**扩散时清谁的记忆：每一个依赖方都清自己的。** 这条不能省，理由在依赖的定义里——
`relationEntityTypes` 由 [`entity_type_dependencies`](../../../packages/rxdb/src/query/entity_type_dependencies.ts)
从 **`where` 本身**提取（`user.name` 这类关系路径、`exists` 子查询、多对多中间表），
所以「查询 A 依赖实体 B」的准确含义是**A 的筛选条件里引用了 B 的字段**，不是「A 的结果里夹带 B 的行」。
于是 B 变了之后，「A 的结果集是否因此增删」只有服务端答得出（与 D1 否决 id 集合是同一条理由），
必须由 **A 自己的 `fetchMetadata`** 来回答。

`syncMemo` 是每个 `Repository` 一份（[Repository.ts](../../../packages/rxdb/src/repository/Repository.ts) 构造期各建各的），
若只清被上报实体那一份，A 的重跑会命中 A 自己的记忆窗口、跳过同步、读回陈旧本地行——
症状与 D2 判死的偷渡**逐字相同**，只是换了个实体，而 AC#2 只测同实体、正好漏过。
因此规则是：**`depEntityTypeMap` 含被上报实体的每一个 `Repository`，都先清自己的记忆再重跑**，
由 AC#7 断言 A 的 `fetchMetadata` 真的发生。

代价照 D1 的账算：无变化则零行拉取。跨实体多算的是「依赖方各一次 metadata 往返」，
这是远端权威的必要开销，不是浪费。

### D2 — 入口落在 `Repository`，因为只有它同时握着记忆与重跑

`Repository` 的构造函数里，`new QueryCacheSyncMemo(...)` 与 `new QueryManager(...)` 相隔四行
（[Repository.ts](../../../packages/rxdb/src/repository/Repository.ts)）。它是全仓库唯一同时够得着这两样东西的地方，
因此也是唯一能保证**先清记忆、后重跑**的地方。

顺序不是风格问题：反过来写，重跑会在记忆窗口内命中 memo、跳过同步、读回同一份陈旧本地行——
症状与今天完全一样，但多了一次请求和一份「我已经修好了」的错觉。这是 US-212 判定里点名的那种偷渡，
必须由一条 AC（#2）钉死，不能只写在注释里。

落地上 `syncMemo` 今天是构造期的内联临时值，需要存成字段才够得着；监听器的注销挂进已有的 `destroy()`（AC#29）。

**分工必须在动手前定死，因为两种分法的稳固程度差一个量级。**
`QueryManager` 的 `#query_task_map` 与 `#dep_entity_type_map` 都是私有字段
（[QueryManager.ts](../../../packages/rxdb/src/repository/QueryManager.ts)），`Repository` 够不着。两条路：

| 分法                                                         | 判定 | 理由                                                                                                                                     |
| :----------------------------------------------------------- | :--- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `QueryManager` 自己监听新事件（与 `#init_db_changes` 同构）  | 否决 | 那样清记忆与重跑落在**两个独立监听器**上，先后由注册顺序决定。「先清后跑」从一行代码退化成一条隐式约定，比今天更脆——正是 D2 要防的那件事 |
| **`Repository` 持单一监听器，`QueryManager` 开内部公开方法** | 采纳 | 顺序回到一个函数体内的两条语句，可读、可测、改不坏                                                                                       |

采纳分法下 `Repository` 收到事件后做三件事，**顺序固定**：

1. `depEntityTypeMap` 里没有被上报实体 → 立即返回（D9 的幂等由这一步兑现）；
2. **同步**清掉本仓储的记忆与在飞查询（`syncMemo.clear()` + D13 的作废）；
3. 把受影响的任务登记进合流窗口，**推迟**到窗口结束统一重跑（D14）。

第 2 步同步、第 3 步异步不是性能考虑，是把「先清后跑」从时序巧合变成结构：
一批通知里所有仓储的清理都发生在任何一次重跑之前。

`QueryManager` 那个新方法的职责只有「按 `depEntityTypeMap` 选中受影响任务并 `refresh()`」，
不碰记忆——记忆归 `Repository`，这条边界与今天一致。

### D3 — 新事件类型，不复用 `EntityRemote*Event`，也不认领那个孤儿常量

复用 `EntityRemoteUpdatedEvent` 有两处硬冲突：

1. 它的载荷要求 `data: Readonly<InstanceType<T>>`，**一整行**。推送侧手上只有「变了」（D8），
   凑不出这个 `data`，凑出来的只能是假的。
2. 它今天的唯一消费者会把它记成 `pullableCount`，于是每来一条远端通知，
   一个与 QueryCache 毫无关系的 changelog 角标就会凭空 +1。

`REMOTE_CHANGES_PENDING_EVENT` 这个常量确实躺在 [rxdb-events.ts](../../../packages/rxdb/src/rxdb-events.ts) 里、
且不在 `RxDBEventMap` 中（[rxdb-devtools 的注释](../../../packages/rxdb-devtools/src/connector-events.ts)专门记过这件事），
看起来正好可以认领——**不认领**。它的名字承诺的是「远端有变更**待拉取**」，那是 changelog 语义；
QueryCache 没有 changelog，拉取的是 metadata 不是 changes。顺手填进 map 会把两条同步路径的状态搅在一起。

**进 `RxDBEventMap` 会连带打断 `rxdb-devtools` 的编译，这是设计意图不是意外。**
[connector-events.ts](../../../packages/rxdb-devtools/src/connector-events.ts) 的订阅清单以
`satisfies Record<keyof RxDBEventMap, boolean>` 收尾，注释写明这条编译期契约就是为了让上游新增事件时
「直接编译失败，而不是静默漏掉」。所以本故事**必须**同改 `rxdb-devtools`，且取值为 `true`——
AC#24 要的面板计数本来就是这份可观测性，把新事件排除在 DevTools 之外与它自相矛盾。
这一条进「实现文件」表（阶段 A），不是留给实现者撞上编译错误时现场决定。

### D4 — 适配器契约不加成员，照 supabase 先例自持通道

不给 `RxDBAdapterRemoteBase` 加 `subscribe?()` 之类的抽象成员。理由是本仓库已有先例且它是对的：
`RxDBAdapterSupabase` 的 realtime 通道完全长在包内——`connect()` 里建 channel，收到消息自己
`adapter.rxdb.dispatchEvent(...)`。适配器手上本来就有 `rxdb`，通知能力是**实现细节**不是契约。

这条同时守住抽象数：新抽象只有 core 那一个入口（见「解锁条件核对」的账）。
也守住 [US-212 AC#19 的结构隔离](../adapter/US-212-http-adapter.md)——调一个 core 的失效入口，
既不是实现也不是调用 `upsertMany` / `deleteByIds` / `getMetadataByIds`，更不持有本地存储。

### D5 — 传输选 SSE，缺省关闭，且不配轮询降级

选 SSE 的理由按分量排：单向就够（客户端只需要一个「变了」）、走原生 `EventSource`、
自带重连语义、服务端零新栈（demo 后端仍是 `node:http`，[US-214 立的零依赖约束](../adapter/US-214-http-browser-demo.md)不破）。
WebSocket 是双向通道，用在单向信号上是 overkill，还要另一套服务端实现。

**缺省关闭**，形状与 `conditionalRequests` 一致：不是所有后端都实现得了推送，
适配器也无从探测。没开 = 今天的行为（下一次 `find()` 照常回远端校验）。

**不配轮询降级。** 铁律「无 fallback 兜底」在这里的具体含义是：SSE 连不上时，
偷偷切一条「每 N 秒 HEAD 一次」的二等通道，会让用户拿到一个**说不清延迟上界**的实时性，
出问题时还查不出走的是哪条路。正确的做法是照 [US-215](../adapter/US-215-conditional-request-silence.md) 的先例
报一个诊断信号——它立的判例就是「开了却不生效必须有嘴」。

### D6 — 自回声抑制复用 `context.clientId`

服务端广播给所有订阅者，包含刚写完的那个客户端。写入方的 remote-then-local 已经在本地清过 memo，
回声只会白搭一次 metadata 往返。`RxDB.init()` 生成的 `clientId` 自述就是
「供 pull/push/realtime 自消息过滤动态读取的托管字段」（[rxdb.interface.ts](../../../packages/rxdb/src/rxdb.interface.ts)），
supabase 侧已经在这么用。复用现成字段，不新增概念。

### D7 — 重连之后必须立刻全量失效

这是**正确性要求，不是优化**。SSE 断开期间发生的变更没有任何人会补发；
重连成功后若不主动失效一次，客户端会把「没收到消息」当成「没有变化」，
而这一次误判会一直持续到下一次窗口到期或本地写——可能是永远。

所以：连接建立成功时（首次与每次重连**一视同仁**）对已订阅实体各上报一次失效。
代价是一次 metadata 往返，无变化则零行拉取（D1 的账）。
补发方案（`Last-Event-ID` + 服务端变更日志）明确不做，见 Out of Scope。

### D8 — 通知只带实体名，不带行数据

三条理由，任意一条都足够：

1. **安全。** 广播的对象是所有订阅者。推行数据 = 把一行内容发给所有连着的客户端，
   多租户后端上这直接是越权泄露。只广播实体名不泄露内容。
2. **权威。** QueryCache 的本地行只有一条写入路径：core 的 `#pull` → `upsertMany`。
   让通知通道直写本地行等于开第二条写路径，并绕过 [US-022](./US-022-querycache-remote-row-contract.md) 的列契约校验。
3. **判不了。** 「这一行属不属于我的 `where`」只有服务端答得出（D1 同款理由）。

结构上钉死：上报口的签名里**没有**承载行数据的参数（AC#10）。想传也传不进来。

### D9 — 未注册的实体名不报错也不算错

服务端会广播它认识的所有实体，而不同客户端注册的实体子集本来就可以不同。
收到一个本客户端没注册的实体名时：不抛（这不是本客户端的错误），不做任何事（没有活查询要刷新），
也不必诊断（这是多客户端系统的正常状态）。上报口因此天然幂等、可高频调用（AC#3）。

### D10 — 新事件不跨 tab 广播

[RxDBTabsGateway](../../../packages/rxdb/src/gateway/RxDBTabsGateway.ts) 转发的是一张显式白名单：
只有 `ENTITY_LOCAL_CREATE / UPDATE / REMOVE` 三个。新事件不在其中，于是**默认就不跨 tab**——
这是结构保证，不是需要维护的判断。

方向也是对的：每个 tab 各自 `connect()`、各自持有一条 SSE 连接，都会收到同一条推送。
再跨 tab 转发一次，N 个 tab 就会产生 N² 次刷新。AC#9 把这条钉住，防止将来有人「顺手」把新事件加进白名单。

### D11 — demo 的通道缺省**开着**，关的那一路交给运行时开关

最初的判断反过来：怕 [US-214 的 e2e](../../../apps/dev-rxdb-http-e2e/) 里那些数请求次数的用例
（`offline-fallback` / `orphan-cleanup` / `page-token` / `conditional-requests`）被多出来的流量搅了，
于是照 US-215 的 `?diagnostics=1` 先例，缺省关闭、要 `?changefeed=1` 才开。

改成缺省开着，是因为那条理由保护错了东西。实时同步是这个 demo 要演示的**主能力**，
藏在参数后面的话，「两个窗口一个改了另一个没反应」会一直被当成 bug 报上来——
为了让流量表干净而把主能力设成默认关闭，是拿演示价值补贴测试便利。

真正让这件事成立的是那个**运行时**开关（`startChangeFeed()` / `stopChangeFeed()`）：
关掉那一路不再需要另开一个页面形态，同一个页面、同一次会话里就能把两种行为都走一遍。
`?changefeed=0` 退化成「开页那一刻的初值」，之后归面板上的勾选框管。
三条对照用例因此都落在同一个构建产物上：默认 → 收敛（AC#22），
`?changefeed=0` → 不收敛（AC#23），页内点掉再勾回 → 开关是真的（AC#24 那一组）。

数请求条数的实验先关掉开关即可——`x-client-id` 写入头是每次请求**现读**开关状态，
不是开页时快照的，所以关掉之后网线上的行为逐字回到没有通道的样子（AC#21）。

### D12 — 记忆要认代次，否则失效会被飞行中的那次同步抹掉

D2 钉住的是**空间顺序**（先清后跑）。还有一条**时间顺序**同样能让失效凭空消失，
而且远端推送会把它从罕见变成常态。今天的同步长这样
（[query-cache-primary.ts](../../../packages/rxdb/src/repository/query-cache-primary.ts) 的 `#sync`）：

```ts
if (this.syncMemo.has(fingerprint)) return;
await this.#runSync(options); // ← 失效落在这个 await 窗口里
this.syncMemo.remember(fingerprint); // ← 把刚才那次 clear() 抹掉了
```

一次同步在飞行中时收到的失效，会被这次同步完成时的 `remember()` 覆盖。客户端从此认为自己「新鲜」，
直到窗口到期或本地写——而它手上是**同步开始那一刻**的数据，失效说的那次变更根本没拉。

今天这个窗口罕见，因为触发 `clear()` 的只有本地写（要人动手）。**推送让它变成常态**：
写入方广播的那一刻，所有客户端大概率正好都在跑同步——这正是广播要通知的那批人。

修法轻且封闭：`QueryCacheSyncMemo` 记一个单调递增的代次，`clear()` 递增；
`#sync` 在开始前取一次代次，`remember(fingerprint, gen)` 只在代次未变时生效。
代次变了说明「这次同步开始之后有人宣告过失效」，那么它的结果**按定义**就不该被记成新鲜。
不新增概念，不改调用形状，AC#26 钉死。

### D13 — 失效必须同时作废在飞查询，`syncMemo` 不是唯一一层去重

`QueryCacheRepository.find()` 在 `syncMemo` 之外还有一层按指纹的并发去重
（[QueryCacheRepository.ts](../../../packages/rxdb/src/repository/QueryCacheRepository.ts) 的 `#inflightQueries`，US-020 AC#13）。
失效之后立刻重跑，若同指纹查询还在飞，`find()` 直接返回**失效之前**发起的那个 `cached$`——
拿回的是旧结果，且不会再有下一次更新。只清记忆治不了这一层：记忆是「要不要发起同步」，
在飞表是「这次 `find` 复用谁」，两把锁各锁一道门。

因此失效路径要同时作废在飞表。**作废 ≠ 取消**：已经订阅上去的调用方照常拿到它们那次的结果，
只是**下一次** `find()` 不再复用它。代价是失效瞬间可能多一次 metadata 往返，这是正确性的价钱。

**本地写路径不跟着改。** `create` / `update` / `remove` 今天只清记忆、不动在飞表，
理论上有同款窗口，但那是 US-020 的既有行为、有既有用例锁着，在本故事顺手改它属于夹带。
若将来要治，是另一条故事的事——这里明写出来，免得它以「反正都改了」的名义溜进来。

### D14 — 同一窗口内的多条上报合流，每个任务最多重跑一次

D9 说上报口「幂等、可高频调用」，但那只覆盖了没有活查询的情形（AC#3）。有活查询时，
后端每写一条广播一条，N 个活查询 × M 条通知 = N×M 次 `fetchMetadata`。
批量导入、脚本刷数据这类场景会把它直接放大成请求风暴，而这些恰恰是最需要实时性的时刻。

所以上报只做两件事：**同步**清记忆与在飞表、**登记**受影响任务；重跑推迟到合流窗口结束统一发起，
同一任务在一个窗口内合并成一次。窗口取一个微任务（`queueMicrotask` 量级）即可——
它要盖住的是「一条推送里带多个实体名」「一批推送在同一轮事件循环里到达」这两种成簇到达，
不是人为攒批，因此**不引入可配置的延迟**：能配的延迟就是能配错的延迟，也会让 AC#22 的上界说不清。

合流的第二个作用见 D2 第 3 步：它让「所有仓储先清完、再开始重跑」成为结构而非时序巧合。

### D15 — 非 QueryCache 实体上的上报是 no-op

被上报实体不是 `SyncType.QueryCache` 时（`SyncType.None` / 版本化路径），上报口**什么都不做**：
不清记忆（没有）、不重跑、不派发。理由与 Out of Scope 那条「不动版本化路径的任何行为」是同一句话——
让它重跑就是改了那条路径的行为，而重跑对它毫无意义：版本化实体的新数据来自 changelog `pullChanges`，
重跑只会把同一份本地行再算一遍，然后把 CPU 账记到实时性头上。

落地方式比早退更硬：监听器**只在 QueryCache 仓储上注册**（`Repository` 构造期按 `syncMemo` 是否存在决定），
非 QueryCache 仓储压根不在监听表里——不做事成了结构，而不是处理器里再判一次同步类型。
对未注册实体名的处理则与 D9 一致（不抛、不做事、不诊断）。
AC#8 由此从「照常重跑」改写为「零重跑、零请求、`pullableCount$` 不变」，与 Out of Scope 不再打架。

## 验收标准

| #   | 阶段 | 前置条件                                                                                      | 操作                                | 预期结果                                                                                                                  | 状态 |
| --- | ---- | --------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | A    | 某 QueryCache 实体上有 N 个活查询（均已同步完、无在飞）                                       | 调一次失效上报口                    | N 个查询各重跑一次，且每次都真的走 `fetchMetadata`（在飞窗口内的情形见 AC#27）                                            | ✅   |
| 2   | A    | `syncStaleTime` 为默认 1000ms，刚同步完不到 1000ms                                            | 上报失效                            | 重跑仍然回远端（证明清记忆发生在重跑**之前**，D2）                                                                        | ✅   |
| 3   | A    | 该实体上没有任何活查询 / 该实体未注册（D9）                                                   | 连续上报 100 次                     | 零请求、不抛错、不留状态                                                                                                  | ✅   |
| 4   | A    | 远端 metadata 与本地完全一致                                                                  | 上报失效                            | 只发 `fetchMetadata`，**零 `findByIds`**                                                                                  | ✅   |
| 5   | A    | 远端某行 `updatedAt` 变新                                                                     | 上报失效                            | 该行被拉取并写入行缓存，活查询发射含新值的结果                                                                            | ✅   |
| 6   | A    | 远端删掉结果集里的一行                                                                        | 上报失效                            | 孤儿被 `#evictOrphans` 驱逐，活查询发射不含该行的结果                                                                     | ✅   |
| 7   | A    | 查询 A 的 `where` 引用实体 B（`relationEntityTypes` 含 B），且 A 刚同步完不到 `syncStaleTime` | 上报 B 失效                         | A 的活查询重跑，**且 A 自己的 `fetchMetadata` 真的发生**——依赖方清的是自己那份记忆（D1 扩散段）                           | ✅   |
| 8   | A    | 非 QueryCache 实体（`SyncType.None` / 版本化）                                                | 上报失效                            | 零重跑、零请求；`pullableCount$` 与 `pullChanges` 均不被触及（D15 / D3）                                                  | ✅   |
| 9   | A    | 两个 tab 都连着同一个库                                                                       | 在 tab1 上报失效                    | tab2 不因此重跑；网关白名单未被扩大（D10）                                                                                | ✅   |
| 10  | A    | 读上报口的签名                                                                                | 静态检查                            | 没有任何参数能承载行数据（D8 的结构保证）                                                                                 | ✅   |
| 11  | A    | 三端 `useFind` / 对应 hook 一行不改                                                           | 各跑一遍框架侧用例                  | 三端都自动拿到刷新；若任一端需要改，三端同改（铁律：API 对称）                                                            | ✅   |
| 12  | B    | `changeFeed` 缺省（关）                                                                       | 完整跑一遍现有包内用例              | 行为与本故事之前**逐字相同**：零新增请求、零连接                                                                          | ✅   |
| 13  | B    | `changeFeed` 开启                                                                             | `connect()` → `disconnect()`        | 连接建立并在断开时关闭；重复连断不泄漏连接                                                                                | ✅   |
| 14  | B    | 连接已建立                                                                                    | 服务端推一条变更通知                | 对应实体的失效上报口被调用一次                                                                                            | ✅   |
| 15  | B    | 通知里的 `clientId` 等于本机 `rxdb.context.clientId`                                          | 服务端推该通知                      | **不**上报失效（自回声抑制，D6）                                                                                          | ✅   |
| 16  | B    | 连接断开后重连成功                                                                            | 观察重连瞬间                        | 立刻对已订阅实体各上报一次失效（D7）；首次连接同样处理                                                                    | ✅   |
| 17  | B    | 服务端不支持该端点 / 连接被拒                                                                 | 开着开关启动                        | 按退避重连；查询路径完全不受影响、不抛错；给出诊断信号（US-215 先例）                                                     | ✅   |
| 18  | B    | US-212 AC#19 的结构隔离契约测试                                                               | 把新代码纳入扫描                    | 仍不实现/不调用 `upsertMany` / `deleteByIds` / `getMetadataByIds`，仍不持有本地存储                                       | ✅   |
| 19  | B    | [http-protocol.md](../../../website/docs/adapters/http-protocol.md)                           | 补「变更通知（可选）」一节          | 写清端点、事件体、`clientId` 字段、CORS 要求、以及**不实现它的后果**（回到今天的行为，不是故障）                          | ✅   |
| 20  | C    | demo 后端                                                                                     | 任一写入端点被调用                  | 向订阅者广播一条通知；载荷只有实体名与 `clientId`，**不含行数据**（D8）                                                   | ✅   |
| 21  | C    | demo 前端                                                                                     | 关掉开关（或 `?changefeed=0` 开页） | 行为与今天逐字相同，含**不发** `x-client-id` 写入头，US-214 既有 e2e 的请求计数断言全绿（D11）                            | ✅   |
| 22  | C    | 两个页面都用默认设置（通道开着），查同一份筛选                                                | 在页面 A 改一条 recipe              | 页面 B **不做任何交互**，**2 秒内**自动显示新值（本机 demo 的预算：一次推送 + 一次 metadata 往返；不是产品 SLA）          | ✅   |
| 23  | C    | 同上但两个页面都带 `?changefeed=0`                                                            | 同样操作                            | 页面 B 不更新——没有通道时的症状被冻成用例（D11）                                                                          | ✅   |
| 24  | C    | demo 面板                                                                                     | 跑一遍 AC#22                        | 面板上能看见：收到几条通知、被抑制了几条回声、触发了几次重跑与几次 `fetchMetadata`                                        | ✅   |
| 25  | —    | 实现完成                                                                                      | 跑门禁                              | `@aiao/rxdb` / `@aiao/rxdb-adapter-http` / `@aiao/rxdb-devtools` 覆盖率不回退；新导出补 TSDoc 并进 api-baseline           | ✅   |
| 26  | A    | 一次同步正在飞行中（`fetchMetadata` 已发出、未回）                                            | 此刻上报失效，等同步跑完            | 该指纹**不进**记忆；下一次读仍回远端（D12 的代次判定）                                                                    | ✅   |
| 27  | A    | 同一指纹的 `find` 在飞行中（`#inflightQueries` 命中窗口内）                                   | 上报失效并触发重跑                  | 重跑发起一次**新的** `fetchMetadata`，不复用在飞结果；原订阅者照常收到它们那次的结果（D13）                               | ✅   |
| 28  | A    | 某实体上有 N 个活查询                                                                         | 同一合流窗口内连续上报 K 次         | 每个任务只重跑一次，`fetchMetadata` 共 N 次而非 N×K 次（D14）                                                             | ✅   |
| 29  | A    | `Repository.destroy()` 已调用                                                                 | 再上报失效                          | 零重跑、零请求；事件监听器已注销，无残留引用（D2）                                                                        | ✅   |
| 30  | A    | 远端 metadata 与本地完全一致（AC#4 同款前置）                                                 | 上报失效，观察订阅者收到几次        | 二选一并由本用例锁定：**要么**不向订阅者重复发射，**要么**发射且在 TSDoc 写明「实时性的代价是等值重发」——不许留在含糊状态 | ✅   |
| 31  | A    | 新事件已进 `RxDBEventMap`                                                                     | 构建 `@aiao/rxdb-devtools`          | 编译通过（`satisfies Record<keyof RxDBEventMap, boolean>` 契约已补齐），且该事件转发值为 `true`（D3）                     | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#25 的门禁在阶段 C 收尾时复跑通过：`@aiao/rxdb` 四指标 ≥ 90%、`@aiao/rxdb-adapter-http` ≥ 80%，
两者均不低于基线；30 个公开包、44 个入口的 API 表面与基线一致。

**阶段 B 留下的那句「阶段 C 只动 `apps/`」判错了。** 阶段 C 反过来要求适配器多开一个诊断出口：
AC#24 要面板数出「被抑制了几条回声」，而抑制发生在适配器内部（D6），被抑制的通知不会走到
`invalidateRemoteEntity`——从 core 的事件流上看，它与「压根没收到」完全一样。拿「广播条数 − 失效条数」
去倒推会把断线期间丢掉的通知一并算成抑制，把一次真实故障显示成一次正常抑制。因此补了与
`onUnavailable` 对称的 `onNotification`（`HttpChangeFeedNotificationHook` /
`HttpChangeFeedNotificationReport`），字段集是固定的五个，结构上带不了行数据，D8 不受影响。
这两个新导出已补 TSDoc 并进 api-baseline，`rxdb-adapter-http.json` 是本阶段唯一变动的基线文件。

## 落地偏差

| 处                 | 故事原文                                                                   | 实际落地                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 阶段 C 的影响面    | 「阶段 C 只动 `apps/`，预期不改这三个包的表面」（阶段 B 收尾时写下的判断） | **判错了。** AC#24 要面板数出「被抑制了几条回声」，而抑制发生在适配器内部，从包外结构上不可见，于是补了与 `onUnavailable` 对称的 `onNotification` 出口，`rxdb-adapter-http` 的表面因此多两个导出               |
| AC#24 的四个数来源 | 未指定                                                                     | received / suppressed ← `onNotification`；重跑次数 ← core 的 `REMOTE_ENTITY_INVALIDATED` 事件（**刻意不用** `received − suppressed`，否则 D9 的静默无效会被算成一次重跑）；`fetchMetadata` ← demo 既有的流量表 |
| AC#21 的开关粒度   | 「关掉开关之后，行为与今天逐字相同」                                       | 开关同时管住 SSE 连接**与** `x-client-id` 写入头：只停前者的话，多出来的自定义头会给写请求引来一次预检，wire 就不再逐字相同了。开关能在运行时翻，因此那个头必须每次请求**现读**开关状态，不能在构造期快照      |
| 组件样式预算       | 未提及                                                                     | 面板样式把 `app.scss` 顶到 4.24kB，`anyComponentStyle` 的警告线 4kb → 5kb（错误线 8kb 不动）：文件在本故事之前就已到 ~3.9kB，压这 244 字节只能靠删面板样式                                                     |

## 实现阶段的结论

- **「数不出来」和「没发生」在外面长得一模一样。** 抑制、断线丢包、实体名对不上（D9）三种情况，
  在 core 的事件流上都表现为「没有失效上报」。面板要区分它们，靠的不是更聪明的推导，而是
  **在发生抑制的那一层多开一个出口**——倒推公式（广播数 − 失效数）会把三者搅成一个数，
  正好盖住要查的东西。诊断口的字段集是固定的五个，因此这个出口不构成绕开 D8 的后门。
- **AC#23 断言的是一个「非事件」，没有可等的信号。** Playwright 的 `expect` 家族全是「等到发生为止」，
  换成任何一条可重试的断言，它都会在第一次求值就通过——于是这条对照用例在通道被误开的那天照样绿。
  这是全仓库少数几处 `waitForTimeout` 正当的场合，用带理由的 `eslint-disable-next-line` 就地记账。
- **「翻默认值会让 e2e 互相串台」是一次误判，证据本身是坏的。** 翻成默认开着之后确实见过
  几次全量跑翻车（AC#23、翻页用例、AC#24 各一次），当时据此断定通道的全局广播 + `syncStaleTime: 0`
  把共享后端变成了测试之间的隐式通道，写下「已回退」。**这个结论不成立**：那几轮 e2e 压根没跑到
  被测代码上——demo 的适配器工厂里有一条
  `const adapter = new RxDBAdapterHttp(db, { auth: () => ...adapter.changeFeedEnabled })`，
  初始化器引用自身，strict 下是 TS7022 / TS7023 两条错，`dev-rxdb-http:build` 每次都倒在
  e2e 启动之前。补上一句类型标注之后，默认开着的全量跑是绿的。
- **教训是「先确认失败发生在被测代码里」。** 上面那串证据看起来很有说服力——失败散在不同用例上、
  单独跑又全绿，完全符合「共享状态串台」的画像，于是它替一个**根本没执行过**的改动背了锅。
  nx 把构建失败与用例失败报在同一片输出里，`grep` 只捞 `passed|failed` 的话两者长得一模一样。
  数请求条数的用例要防的干扰是真的，但那要靠关掉开关来防（AC#21），不是靠把主能力设成默认关闭。

## 后续变更

**本节记验收之后发生的事。上面的 AC 表与决策原文按当时的形态保留，不回改。**

### 2026-08-27 — demo 默认接通 + 通道升为运行时开关

起因是一份 bug 报告：「两个窗口，A 改了 B 没反应，刷新却是对的」。查下来它不是 bug，
正是 D11 定的默认值——但一个要读源码才知道怎么打开的能力，被当成故障报上来只是时间问题。
D11 那条「翻默认值会让 e2e 串台」的顾虑已在上一节查明是误判（构建就没过，用例没执行）。

两处改动：

| 位置                                         | 改动                                                                                                                                              |
| :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/rxdb-adapter-http/RxDBAdapterHttp` | 新增 `startChangeFeed()` / `stopChangeFeed()` / `changeFeedEnabled`。都是类成员，**无新增模块导出**，api-baseline 不动（该基线只记模块级导出）    |
| `apps/dev-rxdb-http`                         | 默认接通；判据由「`?changefeed=1` 才开」翻成「`?changefeed=0` 才关」，且该参数只定**开页初值**；面板上 `data-testid="feed-toggle"` 那格才是主入口 |

因此 AC#21 / AC#22 / AC#23 原文里的「不带 `?changefeed=1` 打开」，在今天的 demo 上读作
「带 `?changefeed=0` 打开」；「实现文件」表里 `apps/dev-rxdb-http/src/app/` 那一行同理。
被验收的**行为**一条没变——关掉通道时页面 B 不更新、写入头不带 `x-client-id`，两条仍由用例守着。

新增能力的端到端证据是 `change-feed.spec.ts` 里第四条用例：同一个页面里关掉、再打开，全程不刷页。
它守的是「这是真开关，不是伪装成开关的 `location.reload()`」——包侧的 API 只有这一条拦得住。

设计口径（都写进了 TSDoc）：

- `changeFeedEnabled` 是**意图**位，不是「SSE 此刻通没通」。断线退避重连期间它仍是 `true`。
- 未配 `changeFeed` 时两个方法都抛 `HttpUnsupportedOperationError`，与 `version()` 未配 `onVersion`
  同一条口径。**不**走 `create` / `update` / `delete` 那种「缺席即不支持」的 `declare` 可选成员模式：
  那套是为 core 的特性探测（`if (!adapter.create)`）服务的，这里没有探测方，做成可选只会让每个
  调用点多写一个 `?.`，而那个 `?.` 恰好就是静默 no-op。
- `disconnect()` **不动**这一位——断开是生命周期事件，不是调用方改了主意；而 `connect()` 受这一位
  管辖，因此手动停掉的通道不会被一次重连悄悄复活。

### 2026-08-27 — 控制端点改了数据也要广播

上一条改动把通道默认打开之后，暴露出一个原本藏着的洞：点「清空数据」，别的客户端毫无察觉，
留着一份已经不存在的 250 行列表。原因是 `broadcastChange()` 只有一个调用点，只有七个协议写端点
走得到；`__control/clear` 与 `__control/reset` 同样改了库里的行，却直接回执走人。

**判据在这里被写死：广播与否看「库里的行变没变」，不看「这条路径属不属于协议」。**
`__control/*` 不进 `http-protocol.md` 说的是「照协议实现后端的人不用抄这一段」，
不是「这段可以不满足协议对通知的要求」——订阅者拿到的是一条只含实体名的通知（D8），
它无从分辨这次变更是谁触发的，也不该分辨。

两条控制端点因此同样认 `x-client-id`：前端点按钮时把 `rxdb.context.clientId` 带上，
后端原样回显进广播，发起页据此丢掉自己的回声（D6）。少了这个头，一次点击会在
「专门用来看流量」的 demo 面板上多出一整轮无谓的 metadata 往返。

广播由 `server.ts` 以回调注入 `handleControlRequest()`，不写进 `control.ts` 自己：
那个文件是 demo 设施，广播是协议那一侧的机制，两者不合并。顺序与协议端点一致——
先改数据、再广播、最后回执。端到端证据是 `change-feed.spec.ts` 第五条用例：
A 点「清空数据」，B 不做任何交互也空掉。

## 技术笔记

- **`syncMemo.clear()` 的粒度天生就对。** `Repository` 是按实体建的，它持有的那份记忆里全是本实体的
  `where` 指纹，所以「清掉本仓储的记忆」= 实体级失效，不需要新的指纹选择协议。这是 D1 选整实体的
  另一半理由：它不但够用，而且**零新增状态**。
- **重跑走 `QueryTask.refresh()`，不走增量合并。** `merge_create` / `merge_update` / `merge_remove` 那套
  需要事件里带着实体数据，本故事的通知没有（D8）。而这三个策略在合不动的时候本来就调 `task.refresh()`——
  重跑是既有出口，不是新机制。
- **实体解析用 `schemaManager.getEntityType(name, namespace)`**，与 `QueryManager` 里那次过滤同源。
  上报口接实体名（QueryCache 用的是 `metadata.name`，打包压缩后 `EntityType.name` 不可靠——
  [Repository.ts](../../../packages/rxdb/src/repository/Repository.ts) 的 `#createQueryCachePrimary` 已经踩过这条）。
- **AC#4「零 `findByIds`」是可断言的；「结果不重新发射」不是。** 重跑必然产生一个新的结果数组，
  是否向订阅者再发一次取决于 `QueryTask#serialize` 与 `markContentChanged` 的去重口径——
  这一点**未核实**，属**推断**。已升格为 AC#30 并给了两条出路（内容去重 / 文档写明等值重发），
  实现阶段二选一并由用例锁定；它不再是一条笔记，因为「不许留在含糊状态」本身需要一个编号才拦得住。
- **`syncMemo` 的三层去重要一起看**：记忆（要不要发起同步，D12）、在飞表（这次 `find` 复用谁，D13）、
  `QueryTask` 的结果去重（要不要向订阅者发射，AC#30）。远端失效必须穿透前两层，第三层是发射口径问题。
  历史上补失效路径的 bug 大多是只想到第一层——三层写在一起，是为了让实现者一眼看见还有另外两层。
- **一个已知的二阶问题，明写在这里而不是假装不存在**：A 的 `where` 引用 B 时，A 同步完成后的本地
  求值仍要读 B 的本地行。若 B 是另一种 sync 类型（本地行由别的路径维护），本地求值可能用到陈旧的 B。
  本故事**不治**这一条——它在今天的本地写路径上同样存在，不是推送引入的。D1 的扩散只保证
  「A 的结果集由服务端重新裁决」，不保证「A 用到的 B 的本地行是最新的」。
- **AC#17 的「不影响查询路径」有个容易写错的边**：SSE 的失败不能变成 `NetworkOfflineError`，
  也不能污染 `offlineFallback` 的判定——那条降级看的是**查询请求**的失败，不是通知连接的死活。
  一条断掉的通知连接不代表离线（可能只是后端没实现该端点）。
- **demo 后端广播的实现面很小**：持有一组 `ServerResponse`，写入端点成功后逐个 `write()` 一行事件。
  连接注册/注销与 `__control` 一样属于非协议的 demo 设施，但**广播端点本身是协议的一部分**（AC#19），
  两者不要混在一个文件里。
- **e2e 的两个页面必须是两个 browser context**，否则共享同一份 OPFS / IndexedDB 与同一个
  BroadcastChannel，测出来的可能是 [US-009 跨 tab 同步](./US-009-cross-tab-sync.md)而不是本故事的通道。
  这条判错了整个阶段 C 就白做。

## 实现文件

| 文件 / 动作                                                                                                             | 阶段   | 说明                                                                                                    |
| :---------------------------------------------------------------------------------------------------------------------- | :----- | :------------------------------------------------------------------------------------------------------ |
| [packages/rxdb/src/rxdb-events.ts](../../../packages/rxdb/src/rxdb-events.ts)                                           | A      | 新事件常量 + 事件类 + 进 `RxDBEventMap`（D3）                                                           |
| [packages/rxdb/src/RxDB.ts](../../../packages/rxdb/src/RxDB.ts)                                                         | A      | 公开失效上报口（名字可议，语义不可议）                                                                  |
| [packages/rxdb/src/repository/Repository.ts](../../../packages/rxdb/src/repository/Repository.ts)                       | A      | `syncMemo` 存字段 + 单一监听器/注销 + 「同步清、合流跑」（D2 / D14）                                    |
| [packages/rxdb/src/repository/QueryManager.ts](../../../packages/rxdb/src/repository/QueryManager.ts)                   | A      | 新增两个内部公开方法：查 `depEntityTypeMap` 是否含该实体；按依赖选中受影响任务并 `refresh()`（D1 / D2） |
| [packages/rxdb/src/repository/query-cache-sync-memo.ts](../../../packages/rxdb/src/repository/query-cache-sync-memo.ts) | A      | 代次字段 + `remember(fp, gen)` 的代次判定（D12）                                                        |
| [packages/rxdb/src/repository/QueryCacheRepository.ts](../../../packages/rxdb/src/repository/QueryCacheRepository.ts)   | A      | 作废在飞表的方法（D13）                                                                                 |
| [packages/rxdb/src/repository/query-cache-primary.ts](../../../packages/rxdb/src/repository/query-cache-primary.ts)     | A      | `#sync` 取代次、传代次；失效路径连带作废在飞表（D12 / D13）                                             |
| [packages/rxdb-devtools/src/connector-events.ts](../../../packages/rxdb-devtools/src/connector-events.ts)               | A      | **编译期契约必改**：新事件补进订阅清单，取值 `true`（D3 / AC#31）                                       |
| [requirements/api-baseline/rxdb.json](../../api-baseline/rxdb.json)                                                     | A      | AC#25：新导出进基线                                                                                     |
| [packages/rxdb-adapter-http/src/change-feed.ts](../../../packages/rxdb-adapter-http/src/change-feed.ts)                 | B / C  | SSE 通道：连接、退避重连、回声抑制、连上即全量失效（D5 / D6 / D7）；C 补 `onNotification` 上报（AC#24） |
| [packages/rxdb-adapter-http/src/http.interface.ts](../../../packages/rxdb-adapter-http/src/http.interface.ts)           | B / C  | `changeFeed` 选项 + 诊断回调类型（缺省关 = 缺席即禁用）；C 补与 `onUnavailable` 对称的通知出口          |
| [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)         | B      | 在 `connect()` / `disconnect()` 上挂通道；订阅实体清单现读（**不加**契约成员，D4）                      |
| [requirements/api-baseline/rxdb-adapter-http.json](../../api-baseline/rxdb-adapter-http.json)                           | B / C  | AC#25                                                                                                   |
| [website/docs/adapters/http-protocol.md](../../../website/docs/adapters/http-protocol.md)                               | B      | AC#19：「变更通知（可选）」一节                                                                         |
| [website/docs/adapters/http.md](../../../website/docs/adapters/http.md)                                                 | B / C  | 客户端侧开关/诊断/重连参数；订正「`connect()` 不建长连接」；C 补 `onNotification`                       |
| [apps/dev-rxdb-http-server/src/](../../../apps/dev-rxdb-http-server/src/)                                               | C      | 广播端点（协议）+ 订阅者登记（demo 设施），两者分文件                                                   |
| [apps/dev-rxdb-http/src/app/](../../../apps/dev-rxdb-http/src/app/)                                                     | C      | 运行时开关（`?changefeed=0` 定初值）+ 面板计数（D11 / AC#24）                                           |
| [apps/dev-rxdb-http-e2e/src/](../../../apps/dev-rxdb-http-e2e/src/)                                                     | C      | 双 context 收敛用例 + 关掉开关的对照用例                                                                |
| [apps/dev-rxdb-http/project.json](../../../apps/dev-rxdb-http/project.json)                                             | C      | `anyComponentStyle` 警告预算 4kb → 5kb：面板样式把 `app.scss` 顶到 4.24kB（错误线仍是 8kb）             |
| [requirements/roadmap.md](../../roadmap.md)                                                                             | 关闭时 | 把「US-212 AC#29」从「明确不排期」移出，指向本文件                                                      |

<!-- 不列 requirements/api-baseline/rxdb-devtools.json：`RXDB_EVENT_SUBSCRIPTIONS` / `RXDB_EVENT_TYPES` 未经 connector.ts 再导出，公共 API 面不变 -->

## References

- [US-212 HTTP 远程适配器](../adapter/US-212-http-adapter.md) — AC#29 的来历与 2026-08-24 的 owner 判定（本故事继承该 AC）
- [US-214 HTTP 适配器浏览器端到端 demo](../adapter/US-214-http-browser-demo.md) — 症状的复现场；阶段 C 在它之上加两页面收敛
- [US-215 条件请求被静默停用时给出可观测信号](../adapter/US-215-conditional-request-silence.md) — D5 诊断信号与 D11 URL 开关的先例
- [US-020 将 QueryCache 接入统一 Repository](./US-020-querycache-repository.md) — `QueryCacheSyncMemo`（D13）的来历
- [US-022 QueryCache 远端行的列契约与缺列诊断](./US-022-querycache-remote-row-contract.md) — D8 第 2 条理由所依赖的写入契约
- [US-009 跨 Tab 数据同步](./US-009-cross-tab-sync.md) — D10 与 e2e 双 context 的对照面
- [roadmap「明确不排期」](../../roadmap.md#明确不排期) — 本故事满足的解锁条件原文
