---
id: US-023
title: QueryCache 远端变更的失效上报口与实时同步
status: Backlog
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
- [x] Negotiable: 上报口的方法名、事件名、SSE 事件体字段可议；「粒度=整实体」「不推行数据」「先清记忆后重跑」不可议（D1 / D8 / D2）
- [x] Valuable: 今天两个客户端改同一份数据，谁也看不见谁——本仓库最像 local-first 却最不 live 的一条路径
- [x] Estimable: 1 个 core 入口 + 1 个事件 + 适配器内一条连接 + demo 广播与两页面 e2e
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

| 层         | 现状                                                                                                                                                  | 证据                                                                                             |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| 适配器契约 | `RxDBAdapterRemoteBase` 的抽象成员是 `pullChanges` / `getChangeCount` / `mergeChanges` / `fetchMetadata` / `findByIds`——**清一色由客户端发起的拉取** | [rxdb-adapter.ts](../../../packages/rxdb/src/rxdb-adapter.ts)                                     |
| 失效状态   | `QueryCacheSyncMemo` 的三条失效路径（窗口到期 / 本仓储写 / 换适配器实例）全部由 core 内部触发，`clear()` 无对外出口，实例由 `Repository` 私有持有     | [query-cache-sync-memo.ts](../../../packages/rxdb/src/repository/query-cache-sync-memo.ts)        |
| 查询重跑   | `QueryManager` 只 `addEventListener` 了 `ENTITY_LOCAL_CREATE / UPDATE / REMOVE` 三个**本地**事件                                                      | [QueryManager.ts](../../../packages/rxdb/src/repository/QueryManager.ts) `#init_db_changes`       |

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

| 解锁条件                       | 是否满足 | 依据                                                                                  |
| :----------------------------- | :------- | :------------------------------------------------------------------------------------ |
| 出现一个真实的实时性需求       | ✅       | 用户对 [US-214](../adapter/US-214-http-browser-demo.md) 的 demo 直接报了这个缺口       |
| 能说清失效粒度                 | ✅       | **整实体**，理由与被否掉的另两种粒度见 D1                                             |

「价值待证」的[判据是病灶数 ≥ 抽象数](../../CONVENTIONS.md)，一并核算：

- **抽象数 = 1**——core 的失效上报口。阶段 B 不加适配器契约成员（D4），阶段 C 是 demo 与协议可选端点，都不新增 core 抽象。
- **病灶数 = 1**——「别的客户端改了，本客户端永不更新」。它可复现、可自动化，且今天**产生错误结果**（屏幕上是过期数据），
  而不是 2026-08-24 判定时说的「只是没有实时性」。判定当时那句话成立的前提是没人盯着屏幕等，现在这个前提没了。

1 ≥ 1，成立。本故事关闭时须把 roadmap 那一行从「明确不排期」移出并指向本文件。

## 范围边界

### In Scope

- core：一个**远端变更失效上报口**，语义是「远端的某个实体变了，你手上的东西不新鲜了」
- 该入口必须同时做两件事且顺序固定：清掉 QueryCache 的同步记忆 → 重跑受影响的活查询（D2）
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

## 交付阶段

| 阶段 | 范围                       | 关闭判据                                              |
| :--- | :------------------------- | :---------------------------------------------------- |
| A    | core 失效上报口            | AC#1–#11，用测试替身即可全绿，不依赖任何适配器        |
| B    | HTTP 适配器变更通知通道    | AC#12–#19，包内单测 + `http-protocol.md` 新一节       |
| C    | demo 后端广播 + 双页面 e2e | AC#20–#24，两个真实浏览器页面自动收敛                 |

阶段 A **不得单独关闭故事**。一个没有调用方的失效入口正是
[US-015 阶段 B 被移出时的那句判词](../../roadmap.md#明确不排期)——「为一个不存在的依赖图准备」。
它的正当性来自阶段 C 的双页面收敛，所以三阶段一并验收。

## 设计决策

### D1 — 失效粒度 = 整实体，扩散按既有依赖表

roadmap 点名要求说清粒度。三选一，逐个算账：

| 粒度         | 判定 | 理由                                                                                                                                                        |
| :----------- | :--- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `where` 指纹 | 否决 | 服务端不知道客户端在查什么。要它知道，就得把每个客户端的 `where` 上传注册——把一个无状态 HTTP 后端改造成有状态订阅服务器，代价远超收益                       |
| id 集合      | 否决 | 见下                                                                                                                                                        |
| **整实体**   | 采纳 | QueryCache 的同步单元本来就是**整个 `where`**（`fetchMetadata(entityName, where)`），实体级失效与它天然同构                                                 |

**id 集合被否决的理由是它省不掉那次往返。** 客户端拿到「id X 变了」之后仍然回答不了唯一要紧的问题：
X 是否落在我的 `where` 里、以及**有没有别的行因为这次变更新进入了我的 `where`**。后半句本地判定不了——
远端权威、服务端过滤，这正是 `fetchMetadata` 存在的理由。于是 id 集合既避不开那次 metadata 请求，
又新增一个必须由服务端保证正确的契约，还会诱导实现者去做本地行直写（D8 明确反对）。

**整实体的代价是可算的**：每个受影响的活查询一次 `fetchMetadata`，响应体只有 `{id, updatedAt}`；
`diffMetadata` 之后若无变化，`#pull` 一行都不拉、`findByIds` 一次都不发（AC#4 钉住这条）。

**扩散不是新机制**：`QueryTask` 已经把 `relationEntityTypes` 登记进 `QueryManager` 共享的 `depEntityTypeMap`，
`#init_db_changes` 的本地事件过滤用的就是它。远端失效沿同一张表扩散，关系查询因此自动覆盖。

### D2 — 入口落在 `Repository`，因为只有它同时握着记忆与重跑

`Repository` 的构造函数里，`new QueryCacheSyncMemo(...)` 与 `new QueryManager(...)` 相隔四行
（[Repository.ts](../../../packages/rxdb/src/repository/Repository.ts)）。它是全仓库唯一同时够得着这两样东西的地方，
因此也是唯一能保证**先清记忆、后重跑**的地方。

顺序不是风格问题：反过来写，重跑会在记忆窗口内命中 memo、跳过同步、读回同一份陈旧本地行——
症状与今天完全一样，但多了一次请求和一份「我已经修好了」的错觉。这是 US-212 判定里点名的那种偷渡，
必须由一条 AC（#2）钉死，不能只写在注释里。

落地上 `syncMemo` 今天是构造期的内联临时值，需要存成字段才够得着；监听器的注销挂进已有的 `destroy()`。

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

### D11 — demo 的开关缺省关闭，理由是别打破既有 e2e

[US-214 的 e2e](../../../apps/dev-rxdb-http-e2e/) 有多条用例在数请求次数
（`offline-fallback` / `orphan-cleanup` / `page-token` / `conditional-requests`），
而 demo 把 `syncStaleTime` 设成了 0。把变更通知无条件打开，等于给每条用例的流量表加一列噪音。

照 US-215 立的 `?diagnostics=1` 先例，用 `?changefeed=1` 显式开启。
同一个构建产物因此同时承载两条对照用例：开 → 收敛（AC#22），关 → 不收敛（AC#23）。
AC#23 那条不是凑数——它把今天的症状冻成用例，证明「不收敛」是关掉开关的结果，而不是功能坏了。

## 验收标准

| #   | 阶段 | 前置条件                                                                | 操作                        | 预期结果                                                                                          | 状态 |
| --- | ---- | ----------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| 1   | A    | 某 QueryCache 实体上有 N 个活查询                                       | 调一次失效上报口            | N 个查询各重跑一次，且每次都真的走 `fetchMetadata`                                                | ⬜   |
| 2   | A    | `syncStaleTime` 为默认 1000ms，刚同步完不到 1000ms                      | 上报失效                    | 重跑仍然回远端（证明清记忆发生在重跑**之前**，D2）                                                | ⬜   |
| 3   | A    | 该实体上没有任何活查询 / 该实体未注册（D9）                             | 连续上报 100 次             | 零请求、不抛错、不留状态                                                                          | ⬜   |
| 4   | A    | 远端 metadata 与本地完全一致                                            | 上报失效                    | 只发 `fetchMetadata`，**零 `findByIds`**                                                          | ⬜   |
| 5   | A    | 远端某行 `updatedAt` 变新                                               | 上报失效                    | 该行被拉取并写入行缓存，活查询发射含新值的结果                                                    | ⬜   |
| 6   | A    | 远端删掉结果集里的一行                                                  | 上报失效                    | 孤儿被 `#evictOrphans` 驱逐，活查询发射不含该行的结果                                             | ⬜   |
| 7   | A    | 查询 A 的 `relationEntityTypes` 含实体 B                                | 上报 B 失效                 | A 的活查询也重跑（依赖扩散，D1）                                                                  | ⬜   |
| 8   | A    | 非 QueryCache 实体（`SyncType.None` / 版本化）                          | 上报失效                    | 活查询照常重跑；`pullableCount$` **不变**，不误伤 changelog 路径（D3）                            | ⬜   |
| 9   | A    | 两个 tab 都连着同一个库                                                 | 在 tab1 上报失效            | tab2 不因此重跑；网关白名单未被扩大（D10）                                                        | ⬜   |
| 10  | A    | 读上报口的签名                                                          | 静态检查                    | 没有任何参数能承载行数据（D8 的结构保证）                                                         | ⬜   |
| 11  | A    | 三端 `useFind` / 对应 hook 一行不改                                     | 各跑一遍框架侧用例          | 三端都自动拿到刷新；若任一端需要改，三端同改（铁律：API 对称）                                    | ⬜   |
| 12  | B    | `changeFeed` 缺省（关）                                                 | 完整跑一遍现有包内用例      | 行为与本故事之前**逐字相同**：零新增请求、零连接                                                  | ⬜   |
| 13  | B    | `changeFeed` 开启                                                       | `connect()` → `disconnect()` | 连接建立并在断开时关闭；重复连断不泄漏连接                                                        | ⬜   |
| 14  | B    | 连接已建立                                                              | 服务端推一条变更通知        | 对应实体的失效上报口被调用一次                                                                    | ⬜   |
| 15  | B    | 通知里的 `clientId` 等于本机 `rxdb.context.clientId`                    | 服务端推该通知              | **不**上报失效（自回声抑制，D6）                                                                  | ⬜   |
| 16  | B    | 连接断开后重连成功                                                      | 观察重连瞬间                | 立刻对已订阅实体各上报一次失效（D7）；首次连接同样处理                                            | ⬜   |
| 17  | B    | 服务端不支持该端点 / 连接被拒                                           | 开着开关启动                | 按退避重连；查询路径完全不受影响、不抛错；给出诊断信号（US-215 先例）                             | ⬜   |
| 18  | B    | US-212 AC#19 的结构隔离契约测试                                         | 把新代码纳入扫描            | 仍不实现/不调用 `upsertMany` / `deleteByIds` / `getMetadataByIds`，仍不持有本地存储                | ⬜   |
| 19  | B    | [http-protocol.md](../../../website/docs/adapters/http-protocol.md)     | 补「变更通知（可选）」一节  | 写清端点、事件体、`clientId` 字段、CORS 要求、以及**不实现它的后果**（回到今天的行为，不是故障）  | ⬜   |
| 20  | C    | demo 后端                                                               | 任一写入端点被调用          | 向订阅者广播一条通知；载荷只有实体名与 `clientId`，**不含行数据**（D8）                           | ⬜   |
| 21  | C    | demo 前端                                                               | 不带 `?changefeed=1` 打开   | 行为与今天逐字相同，US-214 既有 e2e 的请求计数断言全绿（D11）                                     | ⬜   |
| 22  | C    | 两个页面都带 `?changefeed=1`，查同一份筛选                              | 在页面 A 改一条 recipe      | 页面 B **不做任何交互**，在超时内自动显示新值                                                     | ⬜   |
| 23  | C    | 同上但两个页面都不带该参数                                              | 同样操作                    | 页面 B 不更新——今天的症状被冻成用例（D11）                                                       | ⬜   |
| 24  | C    | demo 面板                                                               | 跑一遍 AC#22                | 面板上能看见：收到几条通知、被抑制了几条回声、触发了几次重跑与几次 `fetchMetadata`                | ⬜   |
| 25  | —    | 实现完成                                                                | 跑门禁                      | `@aiao/rxdb` 与 `@aiao/rxdb-adapter-http` 覆盖率不回退；新导出补 TSDoc 并进 api-baseline          | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

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
  这一点**未核实**，属**推断**，实现阶段以用例定论。若确实会重复发射，要么在本故事按内容去重，
  要么明确写进文档说明「实时性的代价是等值重发」，**不许留在含糊状态**。
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

| 文件 / 动作                                                                                              | 阶段 | 说明                                                          |
| :------------------------------------------------------------------------------------------------------- | :--- | :------------------------------------------------------------ |
| [packages/rxdb/src/rxdb-events.ts](../../../packages/rxdb/src/rxdb-events.ts)                             | A    | 新事件常量 + 事件类 + 进 `RxDBEventMap`（D3）                 |
| [packages/rxdb/src/RxDB.ts](../../../packages/rxdb/src/RxDB.ts)                                           | A    | 公开失效上报口（名字可议，语义不可议）                        |
| [packages/rxdb/src/repository/Repository.ts](../../../packages/rxdb/src/repository/Repository.ts)         | A    | `syncMemo` 存字段 + 监听/注销 + 「先清后跑」的顺序（D2）      |
| [packages/rxdb/src/repository/QueryManager.ts](../../../packages/rxdb/src/repository/QueryManager.ts)     | A    | 按 `depEntityTypeMap` 选中受影响任务并 `refresh()`（D1）      |
| [requirements/api-baseline/rxdb.json](../../api-baseline/rxdb.json)                                       | A    | AC#25：新导出进基线                                           |
| `packages/rxdb-adapter-http/src/`（新增变更通知模块 + 选项）                                             | B    | 连接、退避重连、回声抑制、重连全量失效（D5 / D6 / D7）        |
| [requirements/api-baseline/rxdb-adapter-http.json](../../api-baseline/rxdb-adapter-http.json)             | B    | AC#25                                                         |
| [website/docs/adapters/http-protocol.md](../../../website/docs/adapters/http-protocol.md)                 | B    | AC#19：「变更通知（可选）」一节                               |
| [apps/dev-rxdb-http-server/src/](../../../apps/dev-rxdb-http-server/src/)                                 | C    | 广播端点（协议）+ 订阅者登记（demo 设施），两者分文件         |
| [apps/dev-rxdb-http/src/app/](../../../apps/dev-rxdb-http/src/app/)                                       | C    | `?changefeed=1` 开关 + 面板计数（D11 / AC#24）                |
| [apps/dev-rxdb-http-e2e/src/](../../../apps/dev-rxdb-http-e2e/src/)                                       | C    | 双 context 收敛用例 + 关掉开关的对照用例                      |
| [requirements/roadmap.md](../../roadmap.md)                                                               | 关闭时 | 把「US-212 AC#29」从「明确不排期」移出，指向本文件           |

## References

- [US-212 HTTP 远程适配器](../adapter/US-212-http-adapter.md) — AC#29 的来历与 2026-08-24 的 owner 判定（本故事继承该 AC）
- [US-214 HTTP 适配器浏览器端到端 demo](../adapter/US-214-http-browser-demo.md) — 症状的复现场；阶段 C 在它之上加两页面收敛
- [US-215 条件请求被静默停用时给出可观测信号](../adapter/US-215-conditional-request-silence.md) — D5 诊断信号与 D11 URL 开关的先例
- [US-020 将 QueryCache 接入统一 Repository](./US-020-querycache-repository.md) — `QueryCacheSyncMemo`（D13）的来历
- [US-022 QueryCache 远端行的列契约与缺列诊断](./US-022-querycache-remote-row-contract.md) — D8 第 2 条理由所依赖的写入契约
- [US-009 跨 Tab 数据同步](./US-009-cross-tab-sync.md) — D10 与 e2e 双 context 的对照面
- [roadmap「明确不排期」](../../roadmap.md#明确不排期) — 本故事满足的解锁条件原文
