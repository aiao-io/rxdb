---
id: US-035
title: 每个身份一个本地库：打开时核对身份，换账号不混数据
status: Done
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-19
updated: 2026-11-24
tags: [core, sync, identity, local-database]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 不依赖分区同步协议（US-033），对现有的日志同步与 QueryCache 同样生效；多标签页锁定与「从此设备移除此账户数据」在同一 epic 的后续故事
- [x] Negotiable (可协商): 身份键的传入方式、摘要算法、绑定行的存放与连接期守卫的落点由实现决定，候选见技术笔记
- [x] Valuable (有价值): 同一个本地库换了登录身份，上一个身份同步下来的行仍然可读，留下的待推变更会以下一个身份推出去
- [x] Estimable (可估算): 身份键与库名工具 + 绑定与两处核对 + 远端适配器报告调用者身份 + demo + 文档
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 单测覆盖库名工具与两处核对；真栈测试以 anon 与两个用户验证
-->

# 用户故事：每个身份一个本地库

## 作为/我想要/以便

**作为** 用 RxDB 做本地优先应用、同一台设备上会换登录身份的开发者
**我想要** 每个身份用自己的本地库，库记住它属于谁，身份对不上时打不开也同步不了
**以便** 换账号、退出登录之后，上一个身份同步下来的数据不会出现在下一个身份面前，留下的待推变更也不会被推到别人的账号下

## 实现前（`26521c24`）

- **库名与登录身份无关。** `RxDBOptions.dbName` 由应用给定。demo [`setup_rxdb_wa-sqlite.ts`](../../../apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts) 取的是构建时的环境变量，同一个浏览器里换谁登录都是同一个库：

  ```ts
  const dbName = resolveDatabaseName(import.meta.env.VITE_RXDB_DB_NAME);
  ```

- **库不记录数据是以谁的身份同步下来的。** 同步记录只绑定远端库：[`RxDBSync.remoteBackendId`](../../../packages/rxdb/src/system/sync.ts) 存的是 `rxdb_backend_id()`，[`assertRemoteBackend`](../../../packages/rxdb-plugin-sync/src/remote-backend.ts) 比对的也是它。[`RxDBContext.userId`](../../../packages/rxdb/src/rxdb.interface.ts) 由应用设置，只用来填 `createdBy` / `updatedBy`。
- **待推变更不带身份。** 本地的 [`RxDBChange`](../../../packages/rxdb/src/system/change.ts) 没有记录作者的列，推送按 `remoteId = null` 取待推变更，不分是谁留下的。
- **后果。** 远端按身份裁决读取时（QueryCache 以调用者身份直读业务表，或 [US-033](US-033-identity-scoped-read-sync.md) 的分区同步），A 同步下来的行留在库里。B 在同一个库上登录后，离线查询或 `localCacheFirst` 查询会先读到 A 的行；A 留下的未推送变更会在下一次推送时以 B 的会话发出。

## 范围边界

### In Scope

- **身份键与库名工具**：由后端标识（应用给的作用域字符串，例如 Supabase 项目标识）与身份（未登录记为 anon，登录取用户 id）算出不可逆摘要。同一组输入得到同一个库名，不同身份或不同后端互不相同，名字里不含用户 id 或邮箱原文。
- **库与身份绑定**：应用带着身份键打开库。新库在建库时记下身份键；本功能之前建的库没有绑定，第一次带身份键打开时就地绑定。不带身份键打开时不启用这套机制，行为与现在一致。
- **打开时核对**：库已绑定、而打开时给的身份键对不上，连接被拒并报身份不匹配。此时仓储查询拿不到任何行，本地数据不动。离线同样生效。
- **与远端交换数据前核对**：远端适配器报告当前调用者的身份（Supabase：会话令牌里的用户 id，没有会话或令牌是 anon key 记为 anon）。由它算出的身份键与库绑定的对不上，就停止同步并报身份不匹配，不发拉取、推送与 QueryCache 的远端读写请求。同一用户刷新令牌不算变化。
- **不自动改绑**：身份不匹配时停下报错，由应用换到该身份自己的库。把库改绑给另一个身份，等于把上一个身份的数据交给他，所以不替应用做这件事。
- **换身份时的在途请求**：应用销毁旧实例、以新身份打开新库之后，旧实例在途的响应不落任何库。
- **demo 与文档**：`dev-rxdb-supabase` 按会话身份算库名；文档写明用法与边界。

### Out of Scope

以下是同一 epic 的后续故事：

- **多标签页**：一个标签页换了身份，其他标签页的锁定与广播。
- **「从此设备移除此账户数据」**，以及退出登录后旧库保留多久。
- **显式改绑**：要不要提供、改绑之前先清掉什么，随上一条一起定。在此之前，绑错的库只能由应用删除后重建。
- **保密**：本故事防的是数据误混，不是同一台设备上的其他人读盘。本地库不加密时，能打开浏览器存储的人仍然读得到每个身份的库。
- **旧库的数据搬迁**：应用改用按身份命名的库之后，原先那个固定名字的库不会自动搬过去，是否搬、怎么搬由应用决定。
- **按授权分区同步**：见 [US-033](US-033-identity-scoped-read-sync.md)。

## 验收标准

| #   | 前置条件                                            | 操作                                                          | 预期结果                                                                                                                                                               | 状态 |
| --- | --------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 同一个后端标识，身份 anon、A、B                     | 用工具算本地库名                                              | 三个名字互不相同；重复计算结果不变；不含用户 id 原文                                                                                                                   | ✅   |
| 2   | 同一个身份，两个不同的后端标识                      | 用工具算本地库名                                              | 两个名字不同                                                                                                                                                           | ✅   |
| 3   | 一个新库                                            | 以 A 的身份键打开并同步；关闭后 A 再次打开，其间 A 刷新过令牌 | 两次都正常打开与同步；库绑定的是 A                                                                                                                                     | ✅   |
| 4   | 库已绑定 A                                          | 以 B 的身份键打开，在线与离线各一次，随后查询任意仓储         | 连接被拒并报身份不匹配；查询拿不到 A 的任何行；本地数据不动                                                                                                            | ✅   |
| 5   | 库已绑定 anon                                       | 登录后仍以这个库、带登录用户的身份键打开                      | 同样被拒；应用改用该用户自己的库后正常                                                                                                                                 | ✅   |
| 6   | 库已绑定 A，应用按 A 的身份键打开；远端会话实际是 B | 拉取、推送、QueryCache 查询各一次                             | 都报身份不匹配，不发远端读写请求；本地数据不动，待推变更留在原处                                                                                                       | ✅   |
| 7   | A 的拉取在途                                        | 应用销毁该实例，以 B 的身份打开 B 的库，之后旧响应才到        | 旧响应不落库、不推进进度；B 的库里没有 A 的数据                                                                                                                        | ✅   |
| 8   | 本功能之前建的库，没有绑定                          | 第一次带 A 的身份键打开                                       | 就地绑定 A 并照常工作；之后以 B 的身份键打开被拒                                                                                                                       | ✅   |
| 9   | 不带身份键                                          | 按现在的方式打开与同步                                        | 行为与现在一致，现有用例全过                                                                                                                                           | ✅   |
| 10  | `dev-rxdb-supabase`                                 | 两个浏览器上下文各自匿名登录后同步                            | 各自打开按会话身份算出的库；现有 e2e 全过                                                                                                                              | ✅   |
| 11  | `website/docs`                                      | 阅读                                                          | 写明：按身份算库名与带身份键打开的用法；身份不匹配时怎么处理、为什么不自动改绑；它防误混、不是保密边界；本功能之前的库第一次打开时会绑定当时的身份，旧库数据不自动搬迁 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

| AC  | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | [identity-binding.spec.ts](../../../packages/rxdb/src/__tests__/system/identity-binding.spec.ts)「按身份算库名」的「anon、A、B 三个名字互不相同；重复计算结果不变；不含用户 id 原文」，「身份键」的「键里不含用户 id 与后端标识的原文」                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| #2  | 同一文件「同一个身份、两个不同的后端标识，名字不同」；[identity-binding.connect.spec.ts](../../../packages/rxdb/src/__tests__/system/identity-binding.connect.spec.ts)「同一个用户在另一个后端：也是另一个身份，拒绝」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| #3  | identity-binding.connect.spec.ts「关闭后以同一个身份再打开：正常连接，不再写绑定行」；真栈 [identity-guard.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/identity-guard.spec.ts)「同一个用户刷新令牌之后照常同步，库绑定的始终是这个用户」；[caller-identity.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/caller-identity.spec.ts)「同一用户刷新令牌（新令牌、同一个 sub）：身份不变」                                                                                                                                                                                                                                                                                             |
| #4  | 离线：identity-binding.connect.spec.ts「库已绑定 A，以 B 打开：拒绝连接，建表与写迁移行一次都不发生」「被拒之后查询任意仓储：读不到上一个身份留下的行」及其对照用例。在线与离线：真栈 identity-guard.spec.ts「库已绑定 A、以 B 的身份打开：在线与离线都拒绝连接，读不到 A 的行，本地数据不动」，在线时远端会话就是 B                                                                                                                                                                                                                                                                                                                                                                                                  |
| #5  | identity-binding.connect.spec.ts「库已绑定 anon，登录后仍用这个库：同样拒绝」；真栈 identity-guard.spec.ts「库已绑定 anon、登录后仍用这个库：拒绝连接；改用该用户自己的库照常同步」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| #6  | 真栈 identity-guard.spec.ts「拉取：报身份不匹配，一个远端请求都不发」「推送：报身份不匹配，远端没有这一行，待推变更留在原处」「会话换回声明的身份之后：之前被拦下的推送照常发出」。同步插件各入口见 [remote-identity.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/remote-identity.spec.ts)，离线写重放见 [query-cache-outbox.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/query-cache-outbox.spec.ts)「远端会话换了主人（US-035）」。QueryCache 见 [Repository.querycache.spec.ts](../../../packages/rxdb-plugin-querycache/src/__tests__/Repository.querycache.spec.ts)「US-035：声明了身份的实例，QueryCache 读写远端前先核对调用者」与 identity-binding.spec.ts「QueryCache 的远端守卫」 |
| #7  | 真栈 identity-guard.spec.ts「A 的拉取在途时销毁实例、换 B 的库：旧响应不落进任何一个库，A 的进度不动」；[SyncManager.orchestration.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/SyncManager.orchestration.spec.ts)「destroy 之后，还在等适配器的在途操作与之后的调用都以 RxDBError 结束」；[pull-repository.spec.ts](../../../packages/rxdb-plugin-sync/src/__tests__/pull-repository.spec.ts)「会话在途中换了主人：旧响应不落库，游标停在上一轮」；[system-repositories.spec.ts](../../../packages/rxdb/src/__tests__/system/system-repositories.spec.ts) 的三条 `until` 用例                                                                                                                           |
| #8  | identity-binding.connect.spec.ts「第一次带身份打开：就地绑定，之后以别的身份打开被拒」，以及「两个身份同时第一次打开本功能之前建的库」下的两条竞争用例                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| #9  | identity-binding.connect.spec.ts「不声明身份：与没有这个功能时一致」；remote-identity.spec.ts「没有声明身份：与没有这个功能时一致」；Repository.querycache.spec.ts「没声明身份：原样用同一个远端适配器，不问 callerIdentity」；其余现有用例由全量门禁 `pnpm test-all` 复验                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| #10 | [remote-sync.spec.ts](../../../apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts)「opens a separate local database per anonymous session in each browser context」与同文件其余用例。会话身份见 [supabase-session.spec.ts](../../../apps/dev-rxdb-supabase/src/app/supabase-session.spec.ts)「returns who the session belongs to」，`scope` 的写法见 [runtime-config.spec.ts](../../../apps/dev-rxdb-supabase/src/app/runtime-config.spec.ts)                                                                                                                                                                                                                                                                         |
| #11 | [`website/docs/collaboration/sync.md`](../../../website/docs/collaboration/sync.md#每个身份一个本地库) 的「每个身份一个本地库」；[`website/docs/adapters/supabase.md`](../../../website/docs/adapters/supabase.md#为每个身份创建本地库) 的「为每个身份创建本地库」与「报 RxDBIdentityMismatchError」                                                                                                                                                                                                                                                                                                                                                                                                                  |

复验命令：

- 单测：`pnpm nx test rxdb`、`pnpm nx test rxdb-plugin-sync`、`pnpm nx test rxdb-plugin-querycache`、`pnpm nx test dev-rxdb-supabase`。
- 真栈：`pnpm nx test rxdb-adapter-supabase`，先经 `test-env` 起本检出位的隔离栈。
- e2e：隔离栈起好之后，`VITE_SUPABASE_URL=$(docker/supabase-ci-url.sh) VITE_SUPABASE_KEY=<docker/docker-compose.ci.yml 里的 SUPABASE_ANON_KEY> pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`。

验收时的环境与结果见[验证记录](US-035-evidence.md)。

## 技术笔记

- **为什么核对两处**：打开时核对拦的是「应用换了身份却还开着旧库」，离线也要生效，所以只能用应用给的身份键。与远端交换数据前核对拦的是「应用给的身份键与实际会话不符」，这时库里即将写入的是另一个身份的数据。两处缺一处，都会留下一条混数据的路。
- **连接期守卫在核心**：核心新增配置 `RxDBOptions.identity`（过 API 基线）。既有库的引导里，身份核对与能力认领的核对（[`assertClaimedCapabilities`](../../../packages/rxdb/src/system/capability-watermark.ts)）在 [`RxDB.connect()`](../../../packages/rxdb/src/RxDB.ts) 的同一处，排在建表、迁移与一切写入之前，对不上时 `connect()` 被拒、库里一行不动；新库的绑定行随 `createTables` 同批写入，不存在「库建好了、还没绑定」的窗口。
- **绑定存在 `rxdb_migration` 的水位行**：`__rxdb_identity__:<身份键>` 记下绑定，不升系统 schema。本功能之前建的库第一次带身份打开时，先写固定名的竞争行 `__rxdb_identity_claim__`：两个标签页同时绑定，后到的一方撞唯一键，重读之后按读到的绑定放行或拒绝。
- **远端身份从远端适配器来**：契约 [`RxDBAdapterRemoteBase.callerIdentity()`](../../../packages/rxdb/src/rxdb-adapter.ts)，不支持的适配器默认拒绝回答，声明了身份的实例因此拒绝同步。Supabase 适配器按此刻的会话令牌回答（[`identityOfAccessToken`](../../../packages/rxdb-adapter-supabase/src/supabase.helpers.ts)）：已登录是 `sub`；没有令牌、anon key 是 anon；声称已登录却没有 `sub` 时拒绝回答，不猜。
- **与远端身份守卫的关系**：[`RemoteBackendMismatchError`](../../../packages/rxdb-plugin-sync/src/remote-backend.ts) 管的是「远端库换了」，提供 `rebindRemoteBackend()`。本故事管的是「调用者换了」，不自动改绑，显式改绑也不在范围内。核对时机相同：与远端交换数据之前，以及拉回的每一轮落库之前。
- **换身份时的在途请求**：`destroy()` 结束同步插件的这一轮连接，还在等本地适配器的在途操作以 `RxDBError` 结束，不会等到下一个实例的适配器；已经拿到响应的一轮在落库之前再核对一次，会话换了主人就一行不写、游标不动。
- **身份键**：对「后端标识 + 身份」取摘要。不可逆是为了库名里不出现用户 id；用户 id 本身是随机的 UUID，不靠摘要保密。
- **未登录只有一个身份**：没有会话的访客都记为 anon，公开数据本来就不需要区分人。

## 实现文件

- `packages/rxdb/src/system/identity-binding.ts` — 身份键与库名工具、绑定的核对、与远端交换数据前的核对、QueryCache 的远端守卫、身份不匹配错误
- `packages/rxdb/src/RxDB.ts`、`packages/rxdb/src/rxdb.interface.ts` — `RxDBOptions.identity`，连接期守卫与绑定行（过 API 基线）
- `packages/rxdb/src/rxdb-adapter.ts` — 远端适配器契约：报告当前调用者身份（过 API 基线）
- `packages/rxdb/src/system/system-repositories.ts` — 等适配器时可以被连接的结束打断
- `packages/rxdb-plugin-sync/` — 交换数据前与落库前的核对、离线写重放前的核对、`destroy()` 结束在途操作
- `packages/rxdb-plugin-querycache/` — 读写远端之前核对身份的用例（守卫在核心的仓储里）
- `packages/rxdb-adapter-supabase/` — 从会话令牌读调用者身份；真栈测试
- `apps/dev-rxdb-supabase/`、`apps/dev-rxdb-supabase-e2e/` — 按会话身份算库名
- `website/docs/` — 按身份分库

## References

- [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md)
- [US-033 按授权分区同步（只读）](US-033-identity-scoped-read-sync.md)
- [US-225 Supabase 日志同步的访问底线](../adapter/US-225-supabase-sync-protocol-access-baseline.md)
