---
id: US-212
title: HTTP 远程适配器
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-08-21
updated: 2026-08-23
tags: [adapter, http, remote, querycache]
---

<!--
INVEST 检查清单:
- [x] Independent: 零前置。US-020 两阶段已于 2026-08-22 全关，两档发布门禁同时解除
- [x] Negotiable: handler 的字段名与 REST URL 模板细节在 plan 可调整；协议不变量（RuleGroup JSON、不发 SQL、changelog 方法 throw、翻页终止判据、错误分类口径）不可协商
- [x] Valuable: 已有 HTTP/REST API 的开发者今天没有 RemoteBase 可挂，只能 supabase
- [x] Estimable: 对标 supabase 的 QueryCache ducks + 分页/分块，范围收敛到一个新包
- [ ] Small: handlers 注入与 REST mapping 失败模式不同。按「交付阶段」A → B；不拆成 US-212a。Full changelog 传输是另一种 SyncType，另开故事，不是本文件阶段
- [x] Testable: 翻页终止、分块不吞空、changelog throw、错误分类、不持有 local adapter，均可单测
-->

# 用户故事：HTTP 远程适配器

## 交付阶段

| 阶段 | 交付                                                                                                                              | 直接前置 | AC 区段   | 状态 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ---- |
| A    | `@aiao/rxdb-adapter-http`：RemoteBase + 注入 handlers + QueryCache ducks + 翻页/分块 + 发射契约 + 错误分类 + wire 契约 + 结构隔离 | 无       | AC#1～26  | ⬜   |
| B    | REST resource URL 模板、可选 ETag/If-None-Match；可选 SSE/invalidation；可选 eviction                                             | 阶段 A   | AC#27～30 | ⬜   |

**前置与发布门禁：已全部解除（2026-08-23 复核）。** 本故事现在零前置，可直接开工并按 `stable` 发布。

留档两条曾经的锁，避免复查时以为漏了：

- **US-020 的两档发布门禁**（[roadmap 约束 10](../../roadmap.md#排期约束)）：曾要求 US-020 阶段 A 关闭才可发 `experimental`、阶段 B 关闭才可标 `stable`。[US-020](../core/US-020-querycache-repository.md) 两阶段已于 2026-08-22 全关（`status: Done`），两档同时解除。它要防的病症——配了 `SyncType.QueryCache` 却 find 仍打本地、save 仍进 local changelog——已不复存在。
- **epic-006 前置**：曾要求本包不得在 [US-306](../collaboration/US-306-working-tree-commits.md) 阶段 A 的 bypass 门禁冻结前发布。2026-08-22 解除，理由见下方[技术笔记「与 epic-006 的关系」](#与-epic-006-的关系)——注意该段的引用口径已于 2026-08-23 修正。

Full-sync changelog 传输（`pullChanges` / `mergeChanges` 真实现）是另一种 `SyncType`，**不是本文件的阶段 C**。v1 对这些方法必须 throw unsupported。

## 作为/我想要/以便

**作为** 已有 HTTP/REST JSON API、不想绑 supabase 的开发者
**我想要** 一个 `RxDBAdapterRemoteBase` 适配器，把 `RuleGroup` 当 JSON 发给远端，并用**独立注册**的 sqlite 做结构化行缓存
**以便** QueryCache 模式能打到我自己的后端，而不是把 HTTP 适配器做成「内嵌 sqlite 的第三种存储」

## 来源与边界

产品选择：**远端权威 HTTP + 独立注册 sqlite 行缓存**。仓库适配器模型只有 `adapter:local` 与 `adapter:remote` 两种 inject，没有第三种 cache adapter。HTTP **不得内部拥有 sqlite**。search / graph / encryption 绑独立 local adapter——HTTP 若自己 new 一份 sqlite，插件会绑错库。

**写缓存的是 core，不是本包。** 行缓存最终经 [`QueryCacheRepository`](../../../packages/rxdb/src/repository/QueryCacheRepository.ts) 落到 `localAdapter.upsertMany()` / `deleteByIds()`——那两个方法是 [`RxDBAdapterLocalBase`](../../../packages/rxdb/src/rxdb-adapter.ts) 的 abstract 成员，本包（RemoteBase）身上**没有也不该有**。本包在 QueryCache 里的全部职责是 `fetchMetadata` / `findByIds` 两个 remote duck（见 [`query-cache-primary.ts`](../../../packages/rxdb/src/repository/query-cache-primary.ts) 的 `REMOTE_DUCKS`）加可选写入口。这条边界决定了 AC#19 的形状：本包能担保的是**结构隔离**，不是「调用时挑实体」。

现有唯一远程适配器是 [US-203](./US-203-supabase-adapter.md)（Done）。本故事不改 US-203，不 inherit 其 AC#6。HTTP 复制 supabase 在 QueryCache 上已经付过学费的契约：翻页与分块。PostgREST `max-rows` 静默截断时，被截掉的 metadata id 会被当成「远端已删除」，变成假孤儿。HTTP 一样。

### In Scope

- 新包 `@aiao/rxdb-adapter-http`，继承 `RxDBAdapterRemoteBase`
- `ADAPTER_NAME = 'http'`；`inject: ['adapter:remote']`；`declare module` 扩 `RxDBAdapters`
- 阶段 A：handlers 注入（`fetchMetadata` / `findByIds` / 可选 `create|update|delete`），签名与终止判据见[「Handler 契约」](#handler-契约阶段-a)
- 请求体是 JSON `RuleGroup`，**不是 SQL**
- 翻页 `fetchMetadata`（判别式返回，两种形态都支持）、分块 `findByIds`（对标 supabase `select_all_pages` / `#findByIdsInChunks`）
- `fetchMetadata` 的[发射契约](#fetchmetadata对-core-的发射契约)：全部页拼成**一次**发射后 `complete`（core 用 `forkJoin` 并联，多次发射 = 只留最后一页 = 大规模假孤儿；不 complete = 查询永久挂起）
- `IRxDBAdapter` 必选生命周期成员 `connect` / `disconnect` / `version` / `isTableExisted` 的 HTTP 语义（AC#24）
- metadata 的 `updatedAt` 是 **ISO 8601 字符串**，与 [`QueryCacheEntityMetadata`](../../../packages/rxdb/src/entity/sync-options.interface.ts) 一致；不得是 `Date`、不得走实体解码
- `pullChanges` / `mergeChanges` / `getChangeCount` throw 稳定错误码 `remote_changelog_unsupported`；`pullChangesBatch` 是 optional，**不实现**即可（调用点做特性探测），无论如何**不得假空**
- 错误分类锚定 core 已冻结的 [`isNetworkError`](../../../packages/rxdb/src/repository/network-error.ts)：HTTP 响应错误带数字 `status`；传输失败不包装
- auth hook（注入 token / header，不内置 OAuth 流程）
- bigint / binary 字段 fail-fast，稳定错误码 `unsupported_wire_type`（本故事不定义这两类的 wire codec）
- **结构隔离不变量**：本包不实现、不调用 `upsertMany()` / `deleteByIds()` / `getMetadataByIds()`，不实现 `rawQuery`，不持有任何 `QueryCacheLocalAdapter`，构造函数不 `new` 任何本地存储。由本包一条契约测试冻结（AC#19 + AC#25）
- 阶段 B：REST mapping、可选条件请求、可选失效与 eviction

### Out of Scope

- HTTP 内部拥有 / 创建 sqlite（产品 A，已否决）
- 在本包内实现 `upsertMany()` / `deleteByIds()` —— 那是 LocalBase 的面，实现它等于把本包变成第三种存储
- 实现 `rawQuery`（AC#25）—— 一旦实现，本包落进 [adapter-contract §4.6](../../../specs/001-working-tree-commits/contracts/adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决) 的 bypass 门禁，[roadmap 约束 11](../../roadmap.md#排期约束) 用「结构隔离」换掉 epic-006 排期前置的论证随之作废
- 实现 `pushBranches` / `branchExists` / `pullBranches`（AC#26）—— v1 无 Full-sync，分支语义无处落地
- 把传输失败包进自定义 Error 类（会让 `isNetworkError` 认不出，静默打死 `offlineFallback`）
- v1 Full changelog 同步
- Evolu XOR / CRDT
- 乐观离线写（US-020 D5：cache 模式离线只读）
- OpenAPI codegen、魔法 schema 推断
- 把 SQL 字符串发到远端
- `plugin:*` inject；encryption 当传输层
- 未定义协议的 bigint/binary remote wire（US-012 约束：不要在 HTTP JSON 里偷偷发明 codec）
- 重开 epic-002；改 US-203 的 ✅ AC

## Handler 契约（阶段 A）

阶段 A 的 handler 是**用户提供的不透明函数**，因此翻页与分块的归属必须在协议层写死——否则「适配器必须翻页」在实现期只能退化成「文档里劝用户自己翻」，AC 无法验收。

handler 字段名在 plan 可调，但**不要取成 `fetchMetadata` / `findByIds`**：`RxDBAdapterRemoteBase` 上已有同名 abstract 方法且签名不同（方法返回 `Observable<QueryCacheEntityMetadata[]>`，handler 返回下面那个判别式联合），同一文件里并存会让 review 读错哪一层在翻页。建议 `onFetchMetadata` / `onFindByIds`。

### 可配置项与默认值

四个值都必须可覆盖，且**都必须有默认**——留空会让每个接入方各拍一个，而 `pageSize` 与 `maxPages` 的乘积就是单次查询能拉到的 metadata 上限，拍小了就是静默截断，正是本故事要防的东西。

| 配置            | 默认                                   | 作用                                    | 调整时要知道                                                  |
| --------------- | -------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `pageSize`      | `1000`（对标 `SUPABASE_PAGE_SIZE`）    | 单页条数，透传为 handler 的 `ctx.limit` | 与 `maxPages` 相乘即单查询 metadata 上限（默认 100 万条）     |
| `idChunkSize`   | `100`（对标 `SUPABASE_IN_CHUNK_SIZE`） | `findByIds` 单块 id 数                  | 上限来自用户自己的网关 / URL 长度，不是 PostgREST 的 1000     |
| `maxEmptyPages` | `3`                                    | 游标形态下连续空页容忍上限              | `0` = 不容忍空页；**不得**设为 `Infinity`，那等于放弃空转检测 |
| `maxPages`      | `1000`                                 | 单次 `fetchMetadata` 总页数上限         | 触顶是抛错不是截断，见下方 fail-fast                          |

`pageSize > 0`、`maxPages > 0`、`idChunkSize > 0` 由适配器在**构造期**校验并 fail-fast——不是运行期发现异常再兜底。

### `fetchMetadata`：对 core 的发射契约

这条不是本包的偏好，是 core 的调用形态决定的硬约束。[`QueryCacheRepository`](../../../packages/rxdb/src/repository/QueryCacheRepository.ts) 用 `forkJoin` 并联远端 metadata 与本地行：

```ts
forkJoin({
  remoteMetadata: this.remoteAdapter.fetchMetadata(this.entityName, options.where),
  localRows: this.#readLocal(options.where)
});
```

`forkJoin` 的两条语义直接决定正确性，而 [`RxDBAdapterRemoteBase.fetchMetadata`](../../../packages/rxdb/src/rxdb-adapter.ts) 的签名 `Observable<QueryCacheEntityMetadata[]>` 对它们完全沉默：

1. **只保留最后一次发射。** 翻页若实现成「每翻一页 `emit` 一次」——在 Observable 里是最自然的写法，判别式游标分页更是明着诱导——core 只看得到最后一页，前面所有页的 id 全部缺席，被判成远端已删除，即**大规模假孤儿**。这与 PostgREST `max-rows` 静默截断是同一症状、不同成因；本故事其余条款只防了后者。
2. **要求上游 `complete`。** 不 complete 的 Observable 会让 `forkJoin` 永久挂起：查询既不返回也不报错，比返回错数据更难排查。阶段 B 的可选 SSE / invalidation（AC#25）最容易踩这条——**SSE 只能用于通知失效并触发下一次查询，不得让 `fetchMetadata` 变成长连接流**。

因此本包的 `fetchMetadata` **MUST 把所有页拼成一次发射后 complete**（AC#23）。现有 supabase 适配器满足这条纯属结构巧合——`RxDBAdapterSupabase.fetchMetadata` 用 `from(promise)` 包 `select_all_pages`，`from(Promise)` 天然单发射 + complete——**不是遵约**，因为这条契约至今没写在任何面向适配器作者的文档里。缺口与修复归属见 [RV-002](../../reviews/RV-002-fetchmetadata-emission-contract.md)。

### `fetchMetadata`：判别式返回

```ts
type FetchMetadataContext<T> = {
  entityName: string;
  where: RuleGroup<T>;
  /** 本页起始偏移；游标形态可忽略 */
  offset: number;
  /** 来自 config.pageSize，适配器保证 > 0 */
  limit: number;
  /** 上一页返回的 nextCursor；首页为 undefined */
  cursor?: string;
};

type FetchMetadataResult =
  | QueryCacheEntityMetadata[] // 形态 1：短页终止
  | { rows: QueryCacheEntityMetadata[]; nextCursor?: string }; // 形态 2：游标终止

type FetchMetadataHandler<T> = (ctx: FetchMetadataContext<T>) => Promise<FetchMetadataResult>;
```

适配器按**首页的返回形状**锁定本次查询的翻页模式，两种模式的终止判据不同：

| 形态       | 继续条件                   | 终止条件                   | offset 推进       |
| ---------- | -------------------------- | -------------------------- | ----------------- |
| 数组       | `rows.length === limit`    | `rows.length < limit`      | `offset += limit` |
| `{ rows }` | `nextCursor !== undefined` | `nextCursor === undefined` | 由 handler 自己定 |

**fail-fast（不是 fallback，是拒绝）：**

- **换形态**：同一次查询中途首页数组、次页对象（或反之）→ 抛错。混用会让两条终止判据互相盖掉，正是本故事要防的静默截断。
- **游标不推进**：`nextCursor` 与上一页相同 → 抛错，不进死循环。
- **连续空页**：`rows` 为空却仍带 `nextCursor` 的页连续出现 `maxEmptyPages` 次（默认 3）→ 抛错。远端在空转，继续翻只会拉长故障暴露时间。
- **总页数触顶**：超过 `maxPages`（默认 1000）→ 抛错，**不得**返回已拿到的部分。返回部分结果就是把静默截断搬进了客户端。

空页计数器的精确语义（否则它会和「空 `rows` 仍带 `nextCursor` 时必须继续翻」互相打架，见 AC#6）：

- **只在游标形态生效**。数组形态下空页即短页，本来就是正常终止条件，不计数。
- **连续计数，非空即清零**。空一页不是故障，空 `maxEmptyPages` 页才是。所以「空 `rows` + 有 `nextCursor` → 继续翻」与「连续空页触顶 → 抛错」不矛盾：前者描述第 1…N−1 次，后者描述第 N 次。
- 计数器**按单次 `fetchMetadata` 调用**生存，不跨查询累积。

### `findByIds`：分块

```ts
type FindByIdsHandler = (ctx: {
  entityName: string;
  /** 长度 ≤ config.idChunkSize */
  ids: string[];
}) => Promise<unknown[]>;
```

- 分块尺寸取 `idChunkSize`（默认与调整口径见上方[可配置项](#可配置项与默认值)）。
- 任一块 reject → 整个 `findByIds` reject。**不得**把失败块当成空块继续合并——那会让该块的 id 在下一轮被判成远端已删。
- 某块返回的行数**少于**该块 id 数是**合法**结果（远端确实删了），不得据此重试或补空对象。区分这两件事正是本条 AC 的价值。

## 验收标准

### 阶段 A — handlers 远程适配器

| #   | 前置条件                                               | 操作                                                                 | 预期结果                                                                                                                                                                                                                                                                                                        | 状态 |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | workspace 可解析新包                                   | `createRxDatabase` 注册 `{ adapter: 'http', ...handlers }` 为 remote | 适配器作为 `adapter:remote` 连接；`ADAPTER_NAME === 'http'`                                                                                                                                                                                                                                                     | ⬜   |
| 2   | HTTP remote + 独立 sqlite local，`SyncType.QueryCache` | `getRepository(E).find({ where })`                                   | 远端收到 JSON `RuleGroup`，**收不到 SQL**；行缓存由 core 经 `localAdapter.upsertMany` 落到独立 sqlite                                                                                                                                                                                                           | ⬜   |
| 3   | 同上                                                   | `create` / `update` / `delete`                                       | 走 US-020 的 remote-then-local；HTTP 适配器自身不 `new` sqlite、不打开 OPFS/IDB                                                                                                                                                                                                                                 | ⬜   |
| 4   | handlers 未提供 `create`                               | `repo.create(...)`                                                   | fail-fast（`QueryCacheRepository` 已有的「Remote adapter does not support create」语义），不写本地                                                                                                                                                                                                              | ⬜   |
| 5   | handler 返回**数组**，结果集 > `pageSize`              | `fetchMetadata`                                                      | 翻页至 `rows.length < limit` 为止；语义同 supabase `select_all_pages`；截断的 id **不得**被当成远端已删除                                                                                                                                                                                                       | ⬜   |
| 6   | handler 返回 `{ rows, nextCursor }`                    | `fetchMetadata`                                                      | 翻页至 `nextCursor === undefined` 为止；空 `rows` 但有 `nextCursor` 时继续翻                                                                                                                                                                                                                                    | ⬜   |
| 7   | 退化的 handler                                         | `fetchMetadata`                                                      | [fail-fast 四条](#fetchmetadata判别式返回)各**一条独立用例**（换形态 / 游标不推进 / 连续空页触顶 / 总页数触顶），各自抛可区分的错误；四条都**不得**返回已拿到的部分结果，不得进死循环。合并成一条「退化则抛错」的用例不算通过                                                                                   | ⬜   |
| 8   | `findByIds` 的 id 列表 > `idChunkSize`                 | 增量 pull                                                            | 分块请求并合并；语义同 supabase `#findByIdsInChunks`                                                                                                                                                                                                                                                            | ⬜   |
| 9   | 某一块 reject；另一场景某一块返回少行                  | 增量 pull                                                            | reject → 整体 reject，缺块**不得**静默当空；少行 → 合法，不重试不补空对象                                                                                                                                                                                                                                       | ⬜   |
| 10  | HTTP 适配器已连接                                      | 调用 `pullChanges` / `mergeChanges` / `getChangeCount`               | 抛 `remote_changelog_unsupported`；返回空数组 / 0 **算失败**——那会让 Full-sync 以为远端没变更                                                                                                                                                                                                                   | ⬜   |
| 11  | 同上                                                   | 检查 `pullChangesBatch`                                              | 不实现（调用点 [`pull-batch.ts`](../../../packages/rxdb/src/version/pull-batch.ts) 做特性探测，回落到同样 throw 的 `pullChanges`）；若实现则必须 throw，不得返回 `[]`                                                                                                                                           | ⬜   |
| 12  | 远端返回 HTTP 401                                      | QueryCache 读或写                                                    | 抛出的错误带数字 `status`，`isNetworkError` 判 `false`，**不**被 `offlineFallback` 吞成缓存命中                                                                                                                                                                                                                 | ⬜   |
| 13  | 网络断开（fetch reject）                               | 同上                                                                 | 原样上抛 `TypeError` 或抛 `NetworkOfflineError`，**不包装**；`isNetworkError` 判 `true`；`offlineFallback: true` 且有缓存时才降级（US-020 AC#16）                                                                                                                                                               | ⬜   |
| 14  | 远端 metadata 的 `updatedAt` 是 ISO 字符串             | `fetchMetadata`                                                      | 原样透出为 `string`；**不得**解成 `Date`（会让 `diffMetadata` 的字典序比较恒判 fresh，缓存永久停在首次同步，见技术笔记）                                                                                                                                                                                        | ⬜   |
| 15  | 实体声明 bigint / binary 字段                          | `connect()`（**不是**首次查询）                                      | 连接期扫描已注册实体元数据即抛 `unsupported_wire_type`，**不得** `JSON.stringify` 把 `7n` 弄丢或把 `Uint8Array` 塌成 `{"0":1,…}`。放到首次查询才报，等于让一个连得上的库带着注定失败的实体跑到运行期                                                                                                            | ⬜   |
| 16  | 配置了 auth hook                                       | 任意远端请求                                                         | hook 返回的 header 出现在请求上；hook 抛错时请求不发出                                                                                                                                                                                                                                                          | ⬜   |
| 17  | search / graph 插件已装，`inject: ['adapter:local']`   | 连接 HTTP + sqlite                                                   | 插件绑到独立注册的 sqlite，不绑 HTTP、不另开一份库                                                                                                                                                                                                                                                              | ⬜   |
| 18  | 一批 mutations 混入 HTTP-QueryCache 实体与 Full 实体   | `EntityManager.mutations`                                            | 拒绝（US-020 AC#6），错误码 `mixed_versioned_cache_transaction`；本包不提供任何绕过该闸门的入口                                                                                                                                                                                                                 | ⬜   |
| 19  | 本包源码与实例                                         | 结构隔离契约测试                                                     | 本包不实现也不调用 `upsertMany` / `deleteByIds` / `getMetadataByIds`；实例不持有 `QueryCacheLocalAdapter`；构造函数不 `new` 任何本地存储                                                                                                                                                                        | ⬜   |
| 20  | 新包落地                                               | `pnpm nx lint/test/build`、api-baseline、`inject` 契约测试           | 绿；`declare module` 扩 `RxDBAdapters`；覆盖率按非核心包 ≥ 80%                                                                                                                                                                                                                                                  | ⬜   |
| 21  | 能力矩阵 / 公开文档                                    | 关闭阶段 A                                                           | HTTP 行从「待实现」改为已实现；具名适配器计数 9 → 10；写清 v1 只支持 QueryCache、changelog 方法 unsupported                                                                                                                                                                                                     | ⬜   |
| 22  | 对照实体仍是 `SyncType.Full` + supabase 或 sqlite      | 跑既有套件                                                           | 用户可见行为不变；本包不改 Full/Filter 写本地                                                                                                                                                                                                                                                                   | ⬜   |
| 23  | 结果集跨 N 页（N ≥ 2）                                 | 订阅 `fetchMetadata` 返回的 Observable                               | **恰好发射 1 次**（值为 N 页拼接后的全量）并 `complete`。断言发射计数 === 1，不是「最后一次的内容对」——每页一发也能让后者过（见[发射契约](#fetchmetadata对-core-的发射契约)）                                                                                                                                   | ⬜   |
| 24  | 适配器实例                                             | `connect` / `disconnect` / `version` / `isTableExisted`              | 四个 `IRxDBAdapter` 必选成员均有明确语义且可测：连接期完成配置校验与 AC#15 扫描；`isTableExisted` 按远端资源可达性回答，**不得**恒 `true` 蒙混                                                                                                                                                                  | ⬜   |
| 25  | 本包源码                                               | 契约测试断言 `rawQuery` 未实现                                       | 本包 **MUST NOT** 实现 `rawQuery`。实现它会让本包落进 [adapter-contract §4.6](../../../specs/001-working-tree-commits/contracts/adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决) 的 bypass 门禁，[roadmap 约束 11](../../roadmap.md#排期约束) 整套「结构隔离取代 epic-006 前置」的论证随之失效 | ⬜   |
| 26  | 同上                                                   | 检查 `pushBranches` / `branchExists` / `pullBranches`                | 三个 optional 分支成员**不实现**（v1 无 Full-sync，分支语义无处落地）；若实现则必须 throw `remote_changelog_unsupported`，**不得**返回空数组 / `false`                                                                                                                                                          | ⬜   |

### 阶段 B — REST mapping 与可选加速

| #   | 前置条件                       | 操作                                  | 预期结果                                                                                                                                     | 状态 |
| --- | ------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 27  | 阶段 A handlers 可用           | 用 resource URL 模板代替手写 handlers | 等价于阶段 A 的 QueryCache ducks；模板解析失败 fail-fast，不发错 URL                                                                         | ⬜   |
| 28  | 远端支持 ETag / If-None-Match  | 重复 `fetchMetadata` / `findByIds`    | 304 时不把「未修改」当成空集或假孤儿                                                                                                         | ⬜   |
| 29  | 可选 SSE / invalidation 未配置 | 正常 QueryCache 查询                  | 行为与阶段 A 相同；缺可选能力不降级、不抛。配置后 SSE 只能**触发**下一次查询，**不得**让 `fetchMetadata` 变成不 complete 的长连接流（AC#23） | ⬜   |
| 30  | 可选 eviction 未配置           | 行缓存增长                            | 不自动删业务行；eviction 若实现必须是显式策略，默认不丢用户数据                                                                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 产品 B，不是产品 A

HTTP 是 `RxDBAdapterRemoteBase`。sqlite 是另一个 `RxDBAdapterLocalBase`，由应用自己 `createRxDatabase({ adapters: [...] })` 注册。QueryCache 把两者配对。HTTP 构造函数里出现 `new SQLite` / OPFS / IDB 就是本故事失败。

AC#19 是这条的可执行形式。注意它**不是**「调用这两个方法前先判 `sync.type`」——本包身上根本没有这两个方法，写一条「挑实体调用」的测试只能靠临时造一条现实中不存在的调用路径，得到的是一条永远绿、什么也没证明的用例。能担保的是结构隔离：不实现、不调用、不持有。

### 必须复制的 supabase 契约

[RxDBAdapterSupabase](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 的 `pullBranches` 用 `select_all_pages`，注释写明：分支数超过 PostgREST `max-rows` 时单次 select 会被**静默截断**。QueryCache 的 `fetchMetadata` 同一类坑：截断的 id 变成假孤儿，再叠加 US-020 阶段 B 的真 `deleteByIds`，会把还活着的远端行从本地抹掉。

分块 `findByIds` 同理。不要发明「一次 POST 全量 id」然后在网关 413 时返回空。

### `updatedAt` 必须是 ISO 字符串

[`QueryCacheEntityMetadata.updatedAt`](../../../packages/rxdb/src/entity/sync-options.interface.ts) 的类型是 `string`（ISO 8601），新鲜度比较按**字典序**做。US-020 阶段 B 实测踩过：`updatedAt` 一旦经实体解码变成 `Date`，`'2026-08-09T…' > new Date(…)` 会先按 number 提示取原始值，字符串那侧转成 `NaN`，比较**恒为 false**——所有行判 fresh，远端更新永远拉不下来。症状是静默的：查询照常返回，内容停在第一次同步那一刻。

HTTP 包最容易复现的姿势就是「把响应过一遍实体解码再返回」。metadata 通道必须绕开实体解码。

### 错误分类锚定 `isNetworkError`

core 已经把口径冻结在 [`isNetworkError`](../../../packages/rxdb/src/repository/network-error.ts)，该函数的 `@packageDocumentation` 直接点名本故事：

```ts
 * QueryCache 的 `offlineFallback`（US-020 AC#16）与后续的同步重试策略（US-212）。
 * 两处口径必须一致 —— 否则「什么算离线」会在两个地方各自漂移。
```

本包只需满足它的两条硬性输入：

1. **HTTP 响应错误 MUST 带数字 `status`。** 判据第 2 步「拿到了状态码就说明连接是通的」一命中即判非网络错误，401 / 409 / 422 于是自动不会被 `offlineFallback` 吞掉（AC#12）。
2. **传输失败 MUST NOT 被包装。** 识别 fetch 失败靠 `instanceof TypeError` + 已知消息正则；包进自定义 Error 类就认不出，`isNetworkError` 返回 `false`，`offlineFallback` 静默失效——症状是「明明有缓存却报错」（AC#13）。要么原样上抛，要么抛 `NetworkOfflineError`。

第 2 条不是假想风险：**既有的 supabase 适配器正踩在上面**——它把包括传输失败在内的所有错误一律包成 `SupabaseDataError`，五条判据一条不中，`offlineFallback` 在当前唯一已发布的远端适配器上恒不触发。见 [RV-001](../../reviews/RV-001-supabase-error-classification.md)。本包不得复制这个形状。

### changelog 方法必须 throw

v1 不实现 Full-sync。`pullChanges` / `mergeChanges` / `getChangeCount` 若返回空，Full/Filter 会以为远端无变更并覆盖本地认知。unsupported throw 是唯一诚实行为。

`pullChangesBatch` 是 `RxDBAdapterRemoteBase` 上的 **optional** 成员，调用点 [`pull-batch.ts`](../../../packages/rxdb/src/version/pull-batch.ts) 做 `if (remoteAdapter.pullChangesBatch)` 特性探测。因此**不实现**才是符合约定的做法（自动回落到同样 throw 的 `pullChanges`）；真正的不变量是「不得返回空数组」，不是「必须实现成 throw」。

### 两个新错误的判别口径

本故事提到的 `remote_changelog_unsupported` / `unsupported_wire_type` 是**症状名，不是已定的 `code` 字面量**。落地前必须先对齐仓库里并存的三套口径，否则接入方写断言时无从下手：

| 来源                                                                 | 判别位             | 形态                                            |
| -------------------------------------------------------------------- | ------------------ | ----------------------------------------------- |
| 仓库主流（含 core 5 个错误类、supabase 全部错误类）                  | `name`（类名）     | `SupabaseDataError`、`NetworkOfflineError`      |
| supabase 附带的 `code`                                               | `code`（辅助）     | UPPER_SNAKE：`NETWORK_ERROR`、`DATA_ERROR`      |
| [`RxDBError.ts`](../../../packages/rxdb/src/RxDBError.ts) 的唯一特例 | `code`（主判别位） | snake_case：`mixed_versioned_cache_transaction` |

第三行那条**是特例且已声明为特例**——`RxDBError.ts` 原文写着「`code` 是本仓库唯一用错误码而非 `name` 判别的错误：该字符串由 `US-306 FR-046` 指定，跨故事复用，不得改名」。本包若照抄它的 snake_case 形态，就把「唯一」变成「三个」，那句话连同它保护的跨故事契约一起失效。

**本故事的口径**：新错误以**类名**判别（`HttpChangelogUnsupportedError` / `HttpUnsupportedWireTypeError`，名字在 plan 定），需要跨包字符串断言时附带 UPPER_SNAKE 的 `code`，与 supabase 一致。**不新增 snake_case 主判别位。** AC 表里出现的 `remote_changelog_unsupported` / `unsupported_wire_type` 按此读作症状标识。

### 协议

- 请求：JSON `RuleGroup` + 实体名 + id 列表 + 翻页参数。不发 SQL，远端不是你的 sqlite。
- 响应：metadata `{ id, updatedAt }[]`（`updatedAt` 为 ISO 8601 字符串）；实体 JSON 数组。
- bigint/binary 没有本故事定义的 wire codec——实体字段若声明这些类型，阶段 A 抛 `unsupported_wire_type`（AC#15，**单一行为，不给「或拒绝该实体」的第二选项**）。US-018 已经在生成器上为同一类静默丢失付过学费。
- auth：hook 注入 header。401 的错误对象必须带数字 `status`，供 `isNetworkError` 正确分类。

### 与 epic-006 的关系

本包不构成对 [US-306](../collaboration/US-306-working-tree-commits.md) 的排期前置，也不被它前置。理由（2026-08-23 修正引用口径）：

**该引的是** [epic-006 写入口语义矩阵](../../epics/epic-006-working-tree-commits.md#写入口语义矩阵)中 `upsertMany()` / `deleteByIds()` 那一行，及其紧随的注——那里把政策方向定死了（版本化实体表即拒绝、QueryCache 实体表即放行），并明说 US-306 阶段 A 补的是**覆盖面**，「不影响 §4.6 的裁决结论」。

**不要单引** [adapter-contract §4.6](../../../specs/001-working-tree-commits/contracts/adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决) 第 5 步。§4.6 的五步判定只覆盖 `rawQuery`，而这两个方法**不经 `rawQuery`**——[FR-046](../collaboration/US-306-working-tree-commits.md) 与 epic-006 的注都写明「§4.6 的五步判定**够不到**」，所以它们今天落在门禁的结构性缺口里，要靠 US-306 阶段 A（US2-AC23）显式挂载。结论没错，但只引第 5 步会让复查者以为门禁已经生效。

结论不受影响：政策方向已定，本包又完全不碰这两个方法（AC#19），US-306 阶段 A 落地时对本包是 no-op，没有 breaking change 可言。US-306 阶段 A 的 SC-004 漂移扫描仍应把本包纳入扫描范围（[roadmap 约束 11](../../roadmap.md#排期约束)）。

### 依赖

YAML 没有 `depends-on` 字段。本故事当前**零前置**；排期见 [roadmap 批次 1 线 F](../../roadmap.md)。

## 实现文件

| 文件 / 动作                                                  | 阶段 | 说明                                                        |
| ------------------------------------------------------------ | ---- | ----------------------------------------------------------- |
| `packages/rxdb-adapter-http/`（新包）                        | A    | RemoteBase 实现、handlers、翻页/分块、unsupported changelog |
| Nx project / `package.json` workspace 链接                   | A    | 用 workspace 协议链接，不手改 tsconfig paths                |
| `requirements/api-baseline/rxdb-adapter-http.json`           | A    | 新包公开 API 基线                                           |
| `inject: ['adapter:remote']` 契约测试                        | A    | 对齐 US-015 的 adapter inject                               |
| 结构隔离契约测试                                             | A    | AC#19                                                       |
| website / [capability-matrix.md](../../capability-matrix.md) | A    | AC#21（含具名适配器计数 9 → 10）                            |
| REST mapping / ETag / SSE / eviction                         | B    | 可选；缺省不得改变阶段 A 语义                               |

本故事关闭前不改 US-203。能力矩阵在包落地后把「待实现 / US-212」行改成已实现。

## References

- [US-020 QueryCache 接入统一 Repository](../core/US-020-querycache-repository.md) — 曾是唯一硬前置，**已于 2026-08-22 全关，两档发布门禁同时解除**
- [US-203 Supabase 适配器](./US-203-supabase-adapter.md) — 翻页/分块与 QueryCache ducks 的对标；不 inherit AC
- [US-201 SQLite 适配器](./US-201-sqlite-adapter.md) / sqlite-core — 独立 local 缓存后端
- [US-015](../core/US-015-plugin-inject-dependency.md) — `inject: ['adapter:remote']`
- [US-018](../core/US-018-generator-default-serialization.md) — bigint / binary 静默丢失的同类学费，AC#15 的来源
- [US-306 FR-046](../collaboration/US-306-working-tree-commits.md) — cache 排除在工作树外（兼容，不实现）。
  兼容机制见[技术笔记](#与-epic-006-的关系)：本包不碰 `upsertMany()` / `deleteByIds()`，门禁挂载时对本包是 no-op。
  **不构成双向排期前置**
- [epic-004](../../epics/epic-004-future-features.md)
