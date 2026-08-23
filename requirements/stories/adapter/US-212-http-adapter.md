---
id: US-212
title: HTTP 远程适配器
status: In Progress
priority: High
epic: epic-004-future-features
created: 2026-08-21
updated: 2026-08-23
tags: [adapter, http, remote, querycache]
---

<!--
INVEST 检查清单:
- [x] Independent: 零前置。US-020 两阶段已于 2026-08-22 全关，两档发布门禁同时解除
- [x] Negotiable: handler 的字段名、错误类名与 REST URL 模板细节在 plan 可调整；协议不变量（**transport 归适配器**、RuleGroup JSON、不发 SQL、changelog 方法 throw、翻页终止判据、metadata 时间戳规范化、错误分类口径与判别位）不可协商
- [x] Valuable: 已有 HTTP/REST API 的开发者今天没有 RemoteBase 可挂，只能 supabase
- [x] Estimable: 对标 supabase 的 QueryCache ducks + 分页/分块，范围收敛到一个新包
- [ ] Small: handlers 注入与 REST mapping 失败模式不同。按「交付阶段」A → B；不拆成 US-212a。Full changelog 传输是另一种 SyncType，另开故事，不是本文件阶段
- [x] Testable: 翻页终止、分块不吞空、changelog throw、错误分类、不持有 local adapter，均可单测
-->

# 用户故事：HTTP 远程适配器

## 交付阶段

| 阶段 | 交付                                                                                                                                                                | 直接前置 | AC 区段           | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- | ---- |
| A    | `@aiao/rxdb-adapter-http`：RemoteBase + **适配器持有 transport** + 协议 mapping handler + QueryCache ducks + 翻页/分块 + 发射契约 + 错误分类 + wire 契约 + 结构隔离 | 无       | AC#1～26、#31～34 | ✅   |
| B    | REST resource URL 模板（AC#27，可直接实现）；ETag / SSE / eviction（AC#28～30，**设计待定：需先指定跨包 owner**）                                                   | 阶段 A   | AC#27；#28～30 🚧 | ⬜   |

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

产品选择：**远端权威 HTTP + 独立注册 sqlite 行缓存**。仓库的同步配置只有 `sync.local` 与 `sync.remote` 两个槽位（插件侧对应 `adapter:local` / `adapter:remote` 两个依赖 token），没有第三种 cache adapter。HTTP **不得内部拥有 sqlite**。search / graph / encryption 绑独立 local adapter——HTTP 若自己 new 一份 sqlite，插件会绑错库。

**写缓存的是 core，不是本包。** 行缓存最终经 [`QueryCacheRepository`](../../../packages/rxdb/src/repository/QueryCacheRepository.ts) 落到 `localAdapter.upsertMany()` / `deleteByIds()`——那两个方法是 [`RxDBAdapterLocalBase`](../../../packages/rxdb/src/rxdb-adapter.ts) 的 abstract 成员，本包（RemoteBase）身上**没有也不该有**。本包在 QueryCache 里的全部职责是 `fetchMetadata` / `findByIds` 两个 remote duck（见 [`query-cache-primary.ts`](../../../packages/rxdb/src/repository/query-cache-primary.ts) 的 `REMOTE_DUCKS`）加可选写入口。这条边界决定了 AC#19 的形状：本包能担保的是**结构隔离**，不是「调用时挑实体」。

现有唯一远程适配器是 [US-203](./US-203-supabase-adapter.md)（Done）。本故事不改 US-203，不 inherit 其 AC#6。HTTP 复制 supabase 在 QueryCache 上已经付过学费的契约：翻页与分块。PostgREST `max-rows` 静默截断时，被截掉的 metadata id 会被当成「远端已删除」，变成假孤儿。HTTP 一样。

### In Scope

- 新包 `@aiao/rxdb-adapter-http`，继承 `RxDBAdapterRemoteBase`
- `ADAPTER_NAME = 'http'`；`declare module` 扩 `RxDBAdapters`；注册流程见 AC#1（`new RxDB(...)` + `rxdb.adapter('http', factory)`）
- **transport 由适配器持有**：本包负责 `fetch`、auth header 注入、HTTP status 提取与错误分类；handler 只做协议 mapping（产出请求描述 + 解析响应体），**不碰网络**。签名与终止判据见[「Handler 契约」](#handler-契约阶段-a)
- 阶段 A handler：`onFetchMetadata` / `onFindByIds` / 可选 `onCreate|onUpdate|onDelete`
- 请求体是 JSON `RuleGroup`，**不是 SQL**
- 翻页 `fetchMetadata`（判别式返回，两种形态都支持）、分块 `findByIds`（对标 supabase `select_all_pages` / `#findByIdsInChunks`）
- `fetchMetadata` 的[发射契约](#fetchmetadata对-core-的发射契约)：全部页拼成**一次**发射后 `complete`（core 用 `forkJoin` 并联，多次发射 = 只留最后一页 = 大规模假孤儿；不 complete = 查询永久挂起）。`findByIds` [同款契约](#findbyids-的发射契约不是-fetchmetadata-那条的附属)、独立 AC（#33）
- **单请求超时**（`requestTimeoutMs`，默认 30s）：超时抛 core 的 `NetworkOfflineError`，不得让裸 `AbortError` 上抛。理由见[请求超时](#请求超时不是可选项)——不防挂起等于只堵了「查询永远不返回」的一半成因
- `IRxDBAdapter` **9 个必选成员**的 HTTP 语义，语义表见[「生命周期成员」](#生命周期成员的-http-语义)：`connect` / `disconnect` / `version` / `isTableExisted` 需要定义（AC#24），`getRepository` / `saveMany` / `removeMany` / `mutations` 在 v1 下 throw unsupported（AC#32）
- metadata 的 `updatedAt` 是**规范化 ISO 8601 字符串**（UTC `Z` + 3 位毫秒），与 [`QueryCacheEntityMetadata`](../../../packages/rxdb/src/entity/sync-options.interface.ts) 一致；不得是 `Date`、不得走实体解码。规范化理由见[技术笔记](#updatedat-必须是规范化-iso-字符串)
- `pullChanges` / `mergeChanges` / `getChangeCount` throw `HttpChangelogUnsupportedError`（类名判别，名字在 plan 定）；`pullChangesBatch` 是 optional，**不实现**即可（调用点做特性探测），无论如何**不得假空**
- 错误分类锚定 core 已冻结的 [`isNetworkError`](../../../packages/rxdb/src/repository/network-error.ts)：HTTP 响应错误带数字 `status`；传输失败抛 core 的 `NetworkOfflineError`（不得包进本包自定义类，也不得原样上抛 `TypeError`，理由见[错误分类](#错误分类锚定-isnetworkerror)）
- auth hook（注入 token / header，不内置 OAuth 流程）——由适配器在发请求前调用，因此「hook 抛错则请求不发出」可由本包担保（AC#16）
- bigint / binary 字段 fail-fast，抛 `HttpUnsupportedWireTypeError`（本故事不定义这两类的 wire codec）
- **结构隔离不变量**：本包不实现、不调用 `upsertMany()` / `deleteByIds()` / `getMetadataByIds()`，不实现 `rawQuery`，不持有任何 `QueryCacheLocalAdapter`，构造函数不 `new` 任何本地存储。由本包一条契约测试冻结（AC#19 + AC#25）
- 阶段 B：REST mapping、可选条件请求、可选失效与 eviction

### Out of Scope

- HTTP 内部拥有 / 创建 sqlite（产品 A，已否决）
- 在本包内实现 `upsertMany()` / `deleteByIds()` —— 那是 LocalBase 的面，实现它等于把本包变成第三种存储
- 实现 `rawQuery`（AC#25）—— 一旦实现，本包落进 [adapter-contract §4.6](../../../specs/001-working-tree-commits/contracts/adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决) 的 bypass 门禁，[roadmap 约束 11](../../roadmap.md#排期约束) 用「结构隔离」换掉 epic-006 排期前置的论证随之作废
- 实现 `pushBranches` / `branchExists` / `pullBranches`（AC#26）—— v1 无 Full-sync，分支语义无处落地
- 把传输失败包进**本包自定义** Error 类（会让 `isNetworkError` 认不出，静默打死 `offlineFallback`）；也不走「原样上抛 `TypeError`」那条路——node/undici 的 `fetch failed` 不命中 core 正则
- 改 core 的 `FETCH_FAILURE_MESSAGE` 正则或让它读 `error.cause`（放宽后 message 含 `load failed` 的业务错误会被误判成离线；本包自己分类即可）
- v1 Full changelog 同步
- Evolu XOR / CRDT
- 乐观离线写（US-020 D5：cache 模式离线只读）
- OpenAPI codegen、魔法 schema 推断
- 把 SQL 字符串发到远端
- `plugin:*` inject；encryption 当传输层
- 未定义协议的 bigint/binary remote wire（US-012 约束：不要在 HTTP JSON 里偷偷发明 codec）
- 重开 epic-002；改 US-203 的 ✅ AC

## Handler 契约（阶段 A）

### 责任划分：适配器持有 transport

这条必须先定，否则后面四条 AC 无处落地。**发请求的是适配器，不是 handler。**

| 关注点                                       | owner      | 依据                                                                               |
| -------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `fetch` 调用、请求生命周期                   | **适配器** | 只有发请求的人能保证下面四项                                                       |
| auth hook 调用与 header 注入                 | **适配器** | AC#16 的「hook 抛错则请求不发出」只有在发请求前调用 hook 才成立                    |
| HTTP status 提取、错误对象带数字 `status`    | **适配器** | AC#12：`isNetworkError` 判据第 2 步靠 `status` 命中                                |
| 传输失败不包装                               | **适配器** | AC#13：包进自定义 Error 类会让 `isNetworkError` 认不出，静默打死 `offlineFallback` |
| 翻页循环、分块切分、终止判据                 | **适配器** | 见下方两节；handler 只看见单页 / 单块                                              |
| URL / method / body 的形状                   | handler    | 用户的 REST 风格千差万别，这是唯一需要用户填的东西                                 |
| 响应体 → `QueryCacheEntityMetadata[]` 的解析 | handler    | 同上                                                                               |

因此 handler **不是不透明函数**，而是**纯协议 mapping**：给出请求描述、解析响应体，全程不碰网络。这样翻页归属、错误分类和 auth 三件事都能由本包一条契约测试冻结，而不是退化成「文档里劝用户自己做」。

代价要写明：用户不能换用 axios / ky 等自带 HTTP 客户端。阶段 A 不提供 transport 覆盖点——需要时另开故事，不要在阶段 A 偷偷留一个可选 `transport` 参数，那会让上表的 owner 列出现两种答案。

handler 字段名在 plan 可调，但**不要取成 `fetchMetadata` / `findByIds`**：`RxDBAdapterRemoteBase` 上已有同名 abstract 方法且签名不同（方法返回 `Observable<QueryCacheEntityMetadata[]>`，handler 返回下面那个请求描述），同一文件里并存会让 review 读错哪一层在翻页。建议 `onFetchMetadata` / `onFindByIds`。

**写入口的命名方向相反，别顺手对称过去。** `create` / `update` / `delete` 在 `RxDBAdapterRemoteBase` 上**没有** abstract 对应物，它们是 [`QueryCacheRemoteAdapter`](../../../packages/rxdb/src/repository/QueryCacheRepository.ts) 的 optional duck：`QueryCacheRepository` 先 `if (!this.remoteAdapter.create)` 特性探测，再调 `remoteAdapter.create(...)`。因此**适配器类上的方法名必须原样叫 `create` / `update` / `delete`**，只有 handler 字段加 `on` 前缀（`onCreate` / `onUpdate` / `onDelete`）。把类方法也取成 `onCreate` 会让特性探测判 `false`，写入口静默退化成 AC#4 的「不支持 create」——而配置里明明配了 handler。

| 名字                                 | 层      | 依据                                                     |
| ------------------------------------ | ------- | -------------------------------------------------------- |
| `fetchMetadata` / `findByIds`        | 类方法  | `RxDBAdapterRemoteBase` 的 abstract，必须同名            |
| `onFetchMetadata` / `onFindByIds`    | handler | 与上面同名会撞，故加 `on` 前缀                           |
| `create` / `update` / `delete`       | 类方法  | `QueryCacheRemoteAdapter` 的 optional duck，**必须同名** |
| `onCreate` / `onUpdate` / `onDelete` | handler | 与上面同名会撞，故加 `on` 前缀                           |

### 可配置项与默认值

五个值都必须可覆盖，且**都必须有默认**——留空会让每个接入方各拍一个，而 `pageSize` 与 `maxPages` 的乘积就是单次查询能拉到的 metadata 上限，拍小了就是静默截断，正是本故事要防的东西。

| 配置               | 默认                                   | 作用                                    | 调整时要知道                                                          |
| ------------------ | -------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `pageSize`         | `1000`（对标 `SUPABASE_PAGE_SIZE`）    | 单页条数，透传为 handler 的 `ctx.limit` | 与 `maxPages` 相乘即单查询 metadata 上限（默认 100 万条）             |
| `idChunkSize`      | `100`（对标 `SUPABASE_IN_CHUNK_SIZE`） | `findByIds` 单块 id 数                  | 上限来自用户自己的网关 / URL 长度，不是 PostgREST 的 1000             |
| `maxEmptyPages`    | `3`                                    | 游标形态下连续空页容忍上限              | `0` = 不容忍空页；**不得**设为 `Infinity`，那等于放弃空转检测         |
| `maxPages`         | `1000`                                 | 单次 `fetchMetadata` 总页数上限         | 触顶是抛错不是截断，见下方 fail-fast                                  |
| `requestTimeoutMs` | `30000`                                | **单个** HTTP 请求的超时上限            | 计时按单请求，不是整个翻页循环；见下方[请求超时](#请求超时不是可选项) |

五个值都由适配器在**构造期**校验并 fail-fast——不是运行期发现异常再兜底。

校验判据是 **finite 正整数**，不是 `> 0`：

| 判据                                   | 拦掉的东西                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `Number.isInteger(v)`                  | `pageSize = 1.5` 会让 `offset += limit` 逐页漂移，页边界与远端对不齐           |
| `Number.isFinite(v)`                   | `maxPages = Infinity` 等于放弃触顶保护；`NaN` 虽然过不了 `> 0`，但错误信息含糊 |
| `v > 0`（`maxEmptyPages` 为 `v >= 0`） | 负数、零                                                                       |

`maxEmptyPages` 是唯一允许 `0` 的（语义：不容忍空页），其余四个下界为 `1`。`requestTimeoutMs` 同样**不得**为 `Infinity`——那正是本节要防的挂起。

校验失败抛 `HttpConfigError`（类名判别，名字在 plan 定），错误信息 MUST 含字段名与实际值——构造期报错没有调用栈上下文，不带字段名等于让接入方猜。

### 请求超时不是可选项

其余四个配置都朝「防截断」一个方向使力，一项都不防**挂起**。远端 TCP 连上却不回包时，`fetch` 默认永不超时：`fetchMetadata` 既不发射也不报错，`forkJoin` 随之永久挂起——与[发射契约](#fetchmetadata对-core-的发射契约)第 2 条「不 complete = 查询永久挂起」是同一个症状，只是成因从「实现写错」换成了「网络不回包」。防住前者却不防后者，等于只堵了一半。

因此每个 HTTP 请求 MUST 挂 `requestTimeoutMs` 的超时，超时后 MUST 抛 core 的 **`NetworkOfflineError`**（AC#34）：

- **计时粒度是单请求，不是整个 `fetchMetadata`。** 翻 200 页的合法查询不该因为总耗时长被判超时；真正要杀的是卡死在某一页上的那一个请求。
- **不得依赖 `AbortError` 自动被认成网络错误。** `isNetworkError` 的 [`NETWORK_ERROR_NAMES`](../../../packages/rxdb/src/repository/network-error.ts) 明确**排除** `AbortError`（注释写着：那是调用方主动取消，当成离线会让「取消」静默变成「返回缓存」）。所以裸用 `AbortSignal.timeout()` 让 `AbortError` 上抛会被判 `false`，`offlineFallback` 静默失效——与 AC#13 的坑同源。超时必须由本包显式转成 `NetworkOfflineError`。
- **与 `disconnect()` 的取消共用一个 `AbortController` 但结论不同**：超时 → `NetworkOfflineError`（可降级到缓存）；`disconnect()` 主动取消 → 原样上抛取消错误（**不**是网络错误，不得降级）。两条路径的错误必须可区分。

### `fetchMetadata`：对 core 的发射契约

这条不是本包的偏好，是 core 的调用形态决定的硬约束。[`QueryCacheRepository`](../../../packages/rxdb/src/repository/QueryCacheRepository.ts) 用 `forkJoin` 并联远端 metadata 与本地行：

```ts
forkJoin({
  remoteMetadata: this.remoteAdapter.fetchMetadata(this.entityName, options.where),
  localRows: this.#readLocal(options.where)
});
```

`forkJoin` 的两条语义直接决定正确性，而 [`RxDBAdapterRemoteBase.fetchMetadata`](../../../packages/rxdb/src/rxdb-adapter.ts) 的**类型签名** `Observable<QueryCacheEntityMetadata[]>` 对它们完全沉默（约束写在该方法的 TSDoc 里，类型检查拦不住违约）：

1. **只保留最后一次发射。** 翻页若实现成「每翻一页 `emit` 一次」——在 Observable 里是最自然的写法，判别式游标分页更是明着诱导——core 只看得到最后一页，前面所有页的 id 全部缺席，被判成远端已删除，即**大规模假孤儿**。这与 PostgREST `max-rows` 静默截断是同一症状、不同成因；本故事其余条款只防了后者。
2. **要求上游 `complete`。** 不 complete 的 Observable 会让 `forkJoin` 永久挂起：查询既不返回也不报错，比返回错数据更难排查。阶段 B 的可选 SSE / invalidation（AC#29）最容易踩这条——**SSE 只能用于通知失效并触发下一次查询，不得让 `fetchMetadata` 变成长连接流**。

**另一个调用点的语义正好相反，同样承重。** [`query-cache-primary.ts`](../../../packages/rxdb/src/repository/query-cache-primary.ts) 的 `#fetchMetadata` 用 `firstValueFrom`——**只取第一次发射**。逐页发射在 `forkJoin` 侧丢掉除末页外的全部元数据，在 `firstValueFrom` 侧则只看得到首页。两条理由不同，指向同一条结论，所以「单次发射」不是可以在某一侧优化掉的实现细节。

因此本包的 `fetchMetadata` **MUST 把所有页拼成一次发射后 complete**（AC#23）。这条契约已冻结在 [`RxDBAdapterRemoteBase.fetchMetadata` 的 TSDoc](../../../packages/rxdb/src/rxdb-adapter.ts) 里（两个调用点都写明），supabase 侧已有回归测试；本包是照约实现，不是自行发明。顺带记一笔：supabase 满足这条属于结构巧合——`RxDBAdapterSupabase.fetchMetadata` 用 `from(promise)` 包 `select_all_pages`，`from(Promise)` 天然单发射 + complete——本包的翻页循环没有这层天然保护，必须显式拼接。

### `fetchMetadata`：判别式返回

handler 分成 `request` / `parse` 两半，中间那一步（发请求）是适配器的：

```ts
/** handler 产出、适配器执行的请求描述。auth header 由适配器叠加，不在这里写 */
type HttpRequestSpec = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 适配器负责 JSON 序列化 */
  body?: unknown;
  /** 附加 header；与 auth hook 冲突时 auth hook 优先 */
  headers?: Record<string, string>;
};

type FetchMetadataContext<T> = {
  entityName: string;
  where: RuleGroup<T>;
  /** 本页起始偏移；游标形态可忽略 */
  offset: number;
  /** 来自 config.pageSize，适配器保证为 finite 正整数 */
  limit: number;
  /** 上一页返回的 nextCursor；首页为 undefined */
  cursor?: string;
};

type FetchMetadataResult =
  | QueryCacheEntityMetadata[] // 形态 1：短页终止
  | { rows: QueryCacheEntityMetadata[]; nextCursor?: string }; // 形态 2：游标终止

type FetchMetadataHandler<T> = {
  /** 产出本页请求描述。纯函数，不碰网络 */
  request(ctx: FetchMetadataContext<T>): HttpRequestSpec;
  /** 解析已 JSON 解码的响应体。抛错 = 本次 fetchMetadata 失败，不吞不重试 */
  parse(body: unknown, ctx: FetchMetadataContext<T>): FetchMetadataResult;
};
```

翻页循环由适配器跑：`request` → 发请求 → `parse` → 按下表判是否继续。handler 每次只看见一页，看不见循环。

适配器按**首页的返回形状**锁定本次查询的翻页模式，两种模式的终止判据不同：

| 形态       | 继续条件                   | 终止条件                   | offset 推进       |
| ---------- | -------------------------- | -------------------------- | ----------------- |
| 数组       | `rows.length === limit`    | `rows.length < limit`      | `offset += limit` |
| `{ rows }` | `nextCursor !== undefined` | `nextCursor === undefined` | 由 handler 自己定 |

#### 数组形态依赖一条服务端保证，必须写进文档

`rows.length < limit` 判末页，成立的前提是**服务端完整执行了 `limit`**。网关限流、DB 代理、服务端自己的 max-rows 都可能返回短页而并非末页——客户端随后把缺席的 metadata id 判成远端已删除，正是本故事要防的假孤儿，只是成因换了一个。`maxPages` 只是客户端循环上限，证明不了服务端没截断。

因此数组形态的接入方 MUST 满足：

1. **返回少于 `limit` 条即最后一页**——不得因限流、超时或服务端上限提前返回短页。
2. **稳定排序**——同一 `where` 的跨页顺序必须确定，否则翻页会重复或漏行。
3. **一次查询内的快照一致性**，或接受翻页期间新写入的行可能落在页边界外。

**任一条不满足的服务端 MUST 用游标形态。** 这是本包文档的显式要求，不是建议：适配器无法在客户端侧检测短页截断，只能靠这条契约把责任划清。

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
type FindByIdsContext = {
  entityName: string;
  /** 长度 ≤ config.idChunkSize */
  ids: string[];
};

type FindByIdsHandler = {
  /** 产出本块请求描述。纯函数，不碰网络 */
  request(ctx: FindByIdsContext): HttpRequestSpec;
  /** 解析已 JSON 解码的响应体 */
  parse(body: unknown, ctx: FindByIdsContext): unknown[];
};
```

> `ids` 是 `string[]` 而非 `RxDBEntityId[]`，这是**遵守 core 契约**不是遗漏：QueryCache 通道在 core 侧端到端就是 string——[`QueryCacheEntityMetadata.id: string`](../../../packages/rxdb/src/entity/sync-options.interface.ts)、[`RxDBAdapterRemoteBase.findByIds(entityName, ids: string[])`](../../../packages/rxdb/src/rxdb-adapter.ts)、`getMetadataByIds(entityName, ids: string[])` 三处一致。数字主键实体在 QueryCache 下如何工作是 core 的既有问题，不由本故事关闭。

- 分块尺寸取 `idChunkSize`（默认与调整口径见上方[可配置项](#可配置项与默认值)）。
- 任一块 reject → 整个 `findByIds` reject。**不得**把失败块当成空块继续合并——那会让该块的 id 在下一轮被判成远端已删。
- 某块返回的行数**少于**该块 id 数是**合法**结果（远端确实删了），不得据此重试或补空对象。区分这两件事正是本条 AC 的价值。
- **发射契约与 `fetchMetadata` 同款：所有块合并后恰好发射一次再 `complete`**（AC#33）。

#### `findByIds` 的发射契约不是 `fetchMetadata` 那条的附属

它在 [`RxDBAdapterRemoteBase.findByIds` 的 TSDoc](../../../packages/rxdb/src/rxdb-adapter.ts) 里是独立写明的一条（「`ids` 分块查询要合并后再发，调用方同样用 `forkJoin`」），必须有自己的用例。逐块发射的后果比 `fetchMetadata` 侧更直接：`forkJoin` 只留最后一块，前面所有块拉回来的**完整行**当场丢失，而这些行正是要写进本地缓存的数据。

supabase 满足这条同样属于结构巧合——`findByIds` 是 `from(this.#findByIdsInChunks(...))`，`from(Promise)` 天然单发射（[RxDBAdapterSupabase.ts](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)）。**本包的分块循环没有这层天然保护**，与翻页循环是同一个理由，所以 AC#23 与 AC#33 是两条 AC，不能合并成一条。

### 生命周期成员的 HTTP 语义

[`IRxDBAdapter`](../../../packages/rxdb/src/rxdb-adapter.ts) 共 9 个必选成员，本包全部要有答案：下表前四个是「HTTP 没有天然概念、必须定义」的（AC#24），后四个是「答案是 throw，但空着同样没法验收」的（AC#32）。不定义就会各实现自定，`isTableExisted` 尤其容易退化成恒 `true`。

| 成员                     | HTTP 语义                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`              | 不建立长连接。职责是三件事：① 已注册实体的 bigint / binary 扫描并 fail-fast（AC#15）；② 构造期未覆盖的配置交叉校验；③ 返回适配器自身。**不得**在此发探测请求——远端此刻不可达不代表配置错，那是查询期的网络错误，交给 `isNetworkError` 分类                                                                                                   |
| `disconnect()`           | MUST 取消进行中的请求（`AbortController`），正在跑的翻页循环立即中止。中止必须走 **error 通道**，**不得** complete 一个没发射过的 Observable——那样 core 的 `forkJoin` 会静默产出「远端零条」，全表判成孤儿，比抛错危险得多。**已发出的写请求不回滚**——HTTP 没有事务，假装能回滚比不回滚更危险。断开后再调任何 duck MUST 抛错，不得静默返回空 |
| `version()`              | 返回**远端服务端版本**，与 sqlite / pglite / supabase 三家口径一致（它们都返回后端引擎版本，不是适配器包版本）。HTTP 没有内建 RPC，因此配一个可选 `onVersion` handler；**未配置则抛 unsupported**，不得回落到本包 `package.json` 的版本号——那是拿适配器版本冒充后端版本。core 目前不调用 `version()`，抛错不影响连接流程                     |
| `isTableExisted(entity)` | 按**远端资源可达性**回答，**不得**恒 `true` 蒙混。语义是「该实体对应的远端资源存在且可访问」：2xx → `true`，404 → `false`，其余状态码与传输失败 → 抛错（不是返回 `false`，「不知道」和「不存在」必须区分）。判定用哪个请求由 handler 给，缺省可复用 `onFetchMetadata` 的 `limit: 1` 探测                                                     |

> **`isTableExisted` 不在连接流程上，它是给调用方用的公开 API。** core 只有两处调用它，且都收窄在 local 一侧：[`RxDB.connect()`](../../../packages/rxdb/src/RxDB.ts) 的 `if (isLocalAdapter(...))` 分支内，与 `#ensureEntityTables(adapter: RxDBAdapterLocalBase)` 内。remote 适配器的这个方法**不会被 core 的连接流程调用**——所以「恒 `true` 会让连不上的远端跑到首次查询才暴露」不成立，恒 `true` 的真实代价是「调用方问一个可达性问题，拿到一个恒真的假答案」。
>
> 也因此**连接期不做可达性探测**：`connect()` 那一行「不得发探测请求」是本故事的决定，`isTableExisted` 不承担兜底职责，两者不冲突。想在启动时确认远端可达的应用自己调 `isTableExisted`，这是显式选择，不是框架行为。

后四个成员在 v1 下**一律 throw `HttpUnsupportedOperationError`**（类名判别，见[新错误的判别口径](#新错误的判别口径)），**不得**静默返回空数组、`undefined` 或假成功——那会让调用方以为写成功了：

| 成员                      | v1 语义                                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRepository(E)`        | throw。它是 `RxDBAdapterBase` 的 abstract，本包必须有实现体，但 v1 没有可返回的东西：QueryCache 的主仓储由 core 的 `query-cache-primary` 用 **local** 适配器的 `getRepository` 组装，本包这一侧只在 `SyncType.None` + remote-only 配置下才会被订阅，而 v1 不支持那种配置                |
| `saveMany` / `removeMany` | throw。二者是 Full/Filter 的写路径入口，v1 无 Full-sync（与 changelog 方法同口径）                                                                                                                                                                                                      |
| `mutations`               | throw。QueryCache 的批量写**不经过它**：`EntityManager.mutations` 判定为 QueryCache 批后走 `#mutations_query_cache` 的 remote-then-local（见 [`primary-adapter.ts`](../../../packages/rxdb/src/entity/primary-adapter.ts) 的 `isQueryCacheBatch`）。因此这里 throw 不影响 AC#3 的写路径 |

QueryCache 的写入口是 `create` / `update` / `delete` 三个 optional duck（见[命名方向表](#责任划分适配器持有-transport)），与这四个成员是两条互不相干的路径——把写委托给 `mutations` 是错的方向。

## 验收标准

### 阶段 A — handlers 远程适配器

| #   | 前置条件                                               | 操作                                                                                                                                                   | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                               | 状态 |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | workspace 可解析新包                                   | `new RxDB({ sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'http' } } })`，再 `rxdb.adapter('http', db => new RxDBAdapterHttp(db, options))` | 适配器解析为 remote 槽位实例；`ADAPTER_NAME === 'http'`；`declare module` 使 `'http'` 出现在 `keyof RxDBAdapters`。未注册工厂即 `connect()` 时 fail-fast（core 已有「Adapter not found」语义），不静默降级                                                                                                                                                                                                             | ✅   |
| 2   | HTTP remote + 独立 sqlite local，`SyncType.QueryCache` | `getRepository(E).find({ where })`                                                                                                                     | **适配器发出的**请求体是 JSON `RuleGroup`，**不含 SQL**（断言主体是本包的 transport，不是 handler）；行缓存由 core 经 `localAdapter.upsertMany` 落到独立 sqlite                                                                                                                                                                                                                                                        | ✅   |
| 3   | 同上                                                   | `create` / `update` / `delete`                                                                                                                         | 走 US-020 的 remote-then-local；HTTP 适配器自身不 `new` sqlite、不打开 OPFS/IDB                                                                                                                                                                                                                                                                                                                                        | ✅   |
| 4   | handlers 未提供 `create`                               | `repo.create(...)`                                                                                                                                     | fail-fast（`QueryCacheRepository` 已有的「Remote adapter does not support create」语义），不写本地                                                                                                                                                                                                                                                                                                                     | ✅   |
| 5   | handler 返回**数组**，结果集 > `pageSize`              | `fetchMetadata`                                                                                                                                        | 翻页至 `rows.length < limit` 为止；语义同 supabase `select_all_pages`；截断的 id **不得**被当成远端已删除                                                                                                                                                                                                                                                                                                              | ✅   |
| 6   | handler 返回 `{ rows, nextCursor }`                    | `fetchMetadata`                                                                                                                                        | 翻页至 `nextCursor === undefined` 为止；空 `rows` 但有 `nextCursor` 时继续翻                                                                                                                                                                                                                                                                                                                                           | ✅   |
| 7   | 退化的 handler                                         | `fetchMetadata`                                                                                                                                        | [fail-fast 四条](#fetchmetadata判别式返回)各**一条独立用例**（换形态 / 游标不推进 / 连续空页触顶 / 总页数触顶），各自抛可区分的错误；四条都**不得**返回已拿到的部分结果，不得进死循环。合并成一条「退化则抛错」的用例不算通过                                                                                                                                                                                          | ✅   |
| 8   | `findByIds` 的 id 列表 > `idChunkSize`                 | 增量 pull                                                                                                                                              | 分块请求并合并；语义同 supabase `#findByIdsInChunks`                                                                                                                                                                                                                                                                                                                                                                   | ✅   |
| 9   | 某一块 reject；另一场景某一块返回少行                  | 增量 pull                                                                                                                                              | reject → 整体 reject，缺块**不得**静默当空；少行 → 合法，不重试不补空对象                                                                                                                                                                                                                                                                                                                                              | ✅   |
| 10  | HTTP 适配器已连接                                      | 调用 `pullChanges` / `mergeChanges` / `getChangeCount`                                                                                                 | 抛 `HttpChangelogUnsupportedError`（**类名**判别，见[新错误的判别口径](#新错误的判别口径)）；返回空数组 / 0 **算失败**——那会让 Full-sync 以为远端没变更                                                                                                                                                                                                                                                                | ✅   |
| 11  | 同上                                                   | 检查 `pullChangesBatch`                                                                                                                                | 不实现（调用点 [`pull-batch.ts`](../../../packages/rxdb/src/version/pull-batch.ts) 做特性探测，回落到同样 throw 的 `pullChanges`）；若实现则必须 throw，不得返回 `[]`                                                                                                                                                                                                                                                  | ✅   |
| 12  | 远端返回 HTTP 401                                      | QueryCache 读或写                                                                                                                                      | **本包 transport** 抛出的错误带数字 `status`，`isNetworkError` 判 `false`，**不**被 `offlineFallback` 吞成缓存命中。断言主体是适配器：handler 不发请求，因此这条可由本包契约测试冻结                                                                                                                                                                                                                                   | ✅   |
| 13  | 网络断开（fetch reject）                               | 同上                                                                                                                                                   | **本包 transport** 抛 `NetworkOfflineError`（原始 `TypeError` 进 `originalError`），**不得**包进自定义类、**不得**带数字 `status`、**不得**原样上抛 `TypeError`（node/undici 的 `fetch failed` 不命中 core 正则，见[错误分类](#错误分类锚定-isnetworkerror)）；`isNetworkError` 判 `true`；`offlineFallback: true` 且有缓存时才降级（US-020 AC#16）。用例须在 **node 环境**跑（vitest 默认），不得只在浏览器消息上断言 | ✅   |
| 14  | 远端 metadata 的 `updatedAt` 是 ISO 字符串             | `fetchMetadata`                                                                                                                                        | 透出为**规范化 `string`**（UTC `Z` + 3 位毫秒）；**不得**解成 `Date`。三条独立用例：① 已规范化的串原样透出；② 带时区偏移（如 `+08:00`）或缺毫秒的合法 ISO → canonicalize 后再交给 core，**不得**直接透传；③ 非法时间串 → 抛错不吞。理由见[技术笔记](#updatedat-必须是规范化-iso-字符串)                                                                                                                                | ✅   |
| 15  | 实体声明 bigint / binary 字段                          | `connect()`（**不是**首次查询）                                                                                                                        | 连接期扫描已注册实体元数据即抛 `HttpUnsupportedWireTypeError`（类名判别），**不得** `JSON.stringify` 把 `7n` 弄丢或把 `Uint8Array` 塌成 `{"0":1,…}`。放到首次查询才报，等于让一个连得上的库带着注定失败的实体跑到运行期                                                                                                                                                                                                | ✅   |
| 16  | 配置了 auth hook                                       | 任意远端请求                                                                                                                                           | hook 返回的 header 出现在**适配器发出的**请求上；hook 抛错时请求不发出。两条都由本包担保——hook 在 transport 内、发请求前调用                                                                                                                                                                                                                                                                                           | ✅   |
| 17  | search / graph 插件已装，`inject: ['adapter:local']`   | 连接 HTTP + sqlite                                                                                                                                     | 插件绑到独立注册的 sqlite，不绑 HTTP、不另开一份库                                                                                                                                                                                                                                                                                                                                                                     | ✅   |
| 18  | 一批 mutations 混入 HTTP-QueryCache 实体与 Full 实体   | `EntityManager.mutations`                                                                                                                              | 拒绝（US-020 AC#6），错误码 `mixed_versioned_cache_transaction`；本包不提供任何绕过该闸门的入口                                                                                                                                                                                                                                                                                                                        | ✅   |
| 19  | 本包源码与实例                                         | 结构隔离契约测试                                                                                                                                       | 本包不实现也不调用 `upsertMany` / `deleteByIds` / `getMetadataByIds`；实例不持有 `QueryCacheLocalAdapter`；构造函数不 `new` 任何本地存储                                                                                                                                                                                                                                                                               | ✅   |
| 20  | 新包落地                                               | `pnpm nx lint/test/build`、api-baseline、`inject` 契约测试                                                                                             | 绿；`declare module` 扩 `RxDBAdapters`；覆盖率按非核心包 ≥ 80%                                                                                                                                                                                                                                                                                                                                                         | ✅   |
| 21  | 能力矩阵 / 公开文档                                    | 关闭阶段 A                                                                                                                                             | HTTP 行从「待实现」改为已实现；具名适配器计数 9 → 10；写清 v1 只支持 QueryCache、changelog 方法 unsupported                                                                                                                                                                                                                                                                                                            | ✅   |
| 22  | 对照实体仍是 `SyncType.Full` + supabase 或 sqlite      | 跑既有套件                                                                                                                                             | 用户可见行为不变；本包不改 Full/Filter 写本地                                                                                                                                                                                                                                                                                                                                                                          | ✅   |
| 23  | 结果集跨 N 页（N ≥ 2）                                 | 订阅 `fetchMetadata` 返回的 Observable                                                                                                                 | **恰好发射 1 次**（值为 N 页拼接后的全量）并 `complete`。断言发射计数 === 1，不是「最后一次的内容对」——每页一发也能让后者过（见[发射契约](#fetchmetadata对-core-的发射契约)）                                                                                                                                                                                                                                          | ✅   |
| 24  | 适配器实例                                             | `connect` / `disconnect` / `version` / `isTableExisted`                                                                                                | 四个成员按[生命周期语义表](#生命周期成员的-http-语义)实现，**每个成员至少一条独立用例**：`connect` 完成 AC#15 扫描且不发探测请求；`disconnect` 取消进行中的翻页并使后续 duck 调用抛错；`version` 无 `onVersion` 时抛 unsupported、**不得**回落到包版本号；`isTableExisted` 的 2xx→`true` / 404→`false` / 其余→抛错三分支各一条，**不得**恒 `true` 蒙混                                                                 | ✅   |
| 25  | 本包源码                                               | 契约测试断言 `rawQuery` 未实现                                                                                                                         | 本包 **MUST NOT** 实现 `rawQuery`。实现它会让本包落进 [adapter-contract §4.6](../../../specs/001-working-tree-commits/contracts/adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决) 的 bypass 门禁，[roadmap 约束 11](../../roadmap.md#排期约束) 整套「结构隔离取代 epic-006 前置」的论证随之失效                                                                                                        | ✅   |
| 26  | 同上                                                   | 检查 `pushBranches` / `branchExists` / `pullBranches`                                                                                                  | 三个 optional 分支成员**不实现**（v1 无 Full-sync，分支语义无处落地）；若实现则必须 throw `HttpChangelogUnsupportedError`，**不得**返回空数组 / `false`                                                                                                                                                                                                                                                                | ✅   |
| 31  | 构造适配器时传入退化配置                               | `new RxDBAdapterHttp(db, { pageSize, maxPages, idChunkSize, maxEmptyPages, requestTimeoutMs })`                                                        | 构造期抛 `HttpConfigError`，错误信息含字段名与实际值。判据是 **finite 正整数**不是 `> 0`：`1.5` / `Infinity` / `NaN` / `0`（`maxEmptyPages` 除外）/ 负数各一条用例，**五个字段都要覆盖**。见[可配置项](#可配置项与默认值)                                                                                                                                                                                              | ✅   |
| 32  | 适配器实例（v1，无 Full-sync）                         | `getRepository` / `saveMany` / `removeMany` / `mutations`                                                                                              | 四个 `IRxDBAdapter` 必选成员各一条用例：一律抛 `HttpUnsupportedOperationError`（类名判别），**不得**返回空数组 / `undefined` / 假成功。同时断言 QueryCache 路径不受影响——`create`/`update`/`delete` 三个 duck 照常工作（AC#3），批量写走 core 的 `#mutations_query_cache` 而非 `adapter.mutations`。见[生命周期语义表](#生命周期成员的-http-语义)                                                                      | ✅   |
| 33  | id 列表跨 N 块（N ≥ 2），各块均成功                    | 订阅 `findByIds` 返回的 Observable                                                                                                                     | **恰好发射 1 次**（值为 N 块合并后的全量行）并 `complete`。与 AC#23 同款断言：断发射计数 === 1，不是「最后一次的内容对」。这是 `RxDBAdapterRemoteBase.findByIds` TSDoc 独立写明的契约，逐块发射会让 `forkJoin` 只留末块、前面各块拉回的完整行当场丢失。见[发射契约](#findbyids-的发射契约不是-fetchmetadata-那条的附属)                                                                                                | ✅   |
| 34  | 远端 TCP 可连但不回包，超过 `requestTimeoutMs`         | `fetchMetadata` / `findByIds` 各一条                                                                                                                   | 该请求被中止并抛 core 的 `NetworkOfflineError`，`isNetworkError` 判 `true`，`offlineFallback: true` 且有缓存时降级；**不得**永久挂起，**不得**让裸 `AbortError` 上抛（`NETWORK_ERROR_NAMES` 明确排除它，会被判 `false`）。另需一条对照用例：`disconnect()` 主动取消抛出的错误与超时**可区分**且判 `false`（不得降级到缓存）。见[请求超时](#请求超时不是可选项)                                                         | ✅   |

### 阶段 B — REST mapping 与可选加速

> **AC#28～30 是设计待定，不是待实现。** 三条都需要**跨包状态或 API**，而持有者尚未指定：ETag 的 304 处理要有响应缓存的持有者与并发请求策略；SSE/invalidation 要有 core 的失效通知入口；eviction 要在不越过「本包不持有 local adapter」（AC#19）的前提下决定谁删、删哪些行、如何避开正在同步的行。
>
> 「可选」降低的是**交付风险**，不代表设计已完成。**进入阶段 B 前必须先为这三条各自指定 owner**（本包 / core / 应用），否则会把未定义的跨包 API 偷渡进实现。届时若某条拿不到 owner，从本故事移出另开，不要留成「可选但可验收」的 AC。
>
> AC#27 不受此限——REST 模板完全在本包内，可直接实现。

| #   | 前置条件                       | 操作                                  | 预期结果                                                                                                                                                                                  | 状态 |
| --- | ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 27  | 阶段 A handlers 可用           | 用 resource URL 模板代替手写 handlers | 等价于阶段 A 的 QueryCache ducks；模板解析失败 fail-fast，不发错 URL                                                                                                                      | ⬜   |
| 28  | 远端支持 ETag / If-None-Match  | 重复 `fetchMetadata` / `findByIds`    | 304 时不把「未修改」当成空集或假孤儿。**owner 待定**：响应缓存由谁持有、并发请求如何协调                                                                                                  | 🚧   |
| 29  | 可选 SSE / invalidation 未配置 | 正常 QueryCache 查询                  | 行为与阶段 A 相同；缺可选能力不降级、不抛。配置后 SSE 只能**触发**下一次查询，**不得**让 `fetchMetadata` 变成不 complete 的长连接流（AC#23）。**owner 待定**：core 的失效通知入口尚不存在 | 🚧   |
| 30  | 可选 eviction 未配置           | 行缓存增长                            | 不自动删业务行；eviction 若实现必须是显式策略，默认不丢用户数据。**owner 待定**：本包不持有 local adapter，执行者与行选择协议未定                                                         | 🚧   |

状态符号：⬜ 未开始 / 🚧 设计待定（owner 未指定，不可排期） / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 产品 B，不是产品 A

HTTP 是 `RxDBAdapterRemoteBase`。sqlite 是另一个 `RxDBAdapterLocalBase`，由应用自己在 `new RxDB({ sync: { local, remote } })` 里声明、再各自 `rxdb.adapter(name, factory)` 注册。QueryCache 把两者配对。HTTP 构造函数里出现 `new SQLite` / OPFS / IDB 就是本故事失败。

```ts
const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [Product],
  sync: {
    local: { adapter: 'sqlite' }, // 独立注册的行缓存
    remote: { adapter: 'http' }, // 本包
    type: SyncType.QueryCache
  }
});

rxdb.adapter('sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS', async: true }));
rxdb.adapter('http', db => new RxDBAdapterHttp(db, { baseUrl, handlers, auth }));
```

**没有 `createRxDatabase()` 这个函数**——本故事早期版本误用过，AC#1 已改正。仓库的适配器注册入口只有 `RxDB.prototype.adapter()`。

同样，**适配器身上没有 `inject`**。`inject` 是 [`IRxDBPlugin`](../../../packages/rxdb/src/rxdb-plugin.ts) 的字段，`'adapter:remote'` 是**插件**声明依赖用的 token，由 `RxDB` 从 `config.sync.remote.adapter` 反解成实例。本包要写的是 `declare module` 扩 `RxDBAdapters`，不是 `inject`。

AC#19 是这条的可执行形式。注意它**不是**「调用这两个方法前先判 `sync.type`」——本包身上根本没有这两个方法，写一条「挑实体调用」的测试只能靠临时造一条现实中不存在的调用路径，得到的是一条永远绿、什么也没证明的用例。能担保的是结构隔离：不实现、不调用、不持有。

### 必须复制的 supabase 契约

[RxDBAdapterSupabase](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 的 `pullBranches` 用 `select_all_pages`，注释写明：分支数超过 PostgREST `max-rows` 时单次 select 会被**静默截断**。QueryCache 的 `fetchMetadata` 同一类坑：截断的 id 变成假孤儿，再叠加 US-020 阶段 B 的真 `deleteByIds`，会把还活着的远端行从本地抹掉。

分块 `findByIds` 同理。不要发明「一次 POST 全量 id」然后在网关 413 时返回空。

### `updatedAt` 必须是规范化 ISO 字符串

[`QueryCacheEntityMetadata.updatedAt`](../../../packages/rxdb/src/entity/sync-options.interface.ts) 的类型是 `string`（ISO 8601），新鲜度比较按**字典序**做。这里有**两个**独立的坑，AC#14 两个都要防。

#### 坑一：解成 `Date`（US-020 阶段 B 实测踩过）

`updatedAt` 一旦经实体解码变成 `Date`，`'2026-08-09T…' > new Date(…)` 会先按 number 提示取原始值，字符串那侧转成 `NaN`，比较**恒为 false**——所有行判 fresh，远端更新永远拉不下来。症状是静默的：查询照常返回，内容停在第一次同步那一刻。

HTTP 包最容易复现的姿势就是「把响应过一遍实体解码再返回」。metadata 通道必须绕开实体解码。

#### 坑二：合法但不规范的 ISO 串

**「是合法 ISO 8601」不足以保证字典序等价于时间序。** 比较的两侧形态不同：

- 远端侧：[`diffMetadata`](../../../packages/rxdb/src/repository/diff-metadata.ts) 直接 `remote.updatedAt > localUpdatedAt`，原样比字符串。
- 本地侧：core 用 `toISOString()` 归一（[`QueryCacheRepository`](../../../packages/rxdb/src/repository/QueryCacheRepository.ts)），**恒为 UTC `Z` + 3 位毫秒**。

于是远端返回 `2026-08-23T18:00:00+08:00`（= UTC 10:00，确实比本地的 `2026-08-23T10:30:00.000Z` 旧）时，字典序逐字符比到时位就得出 `18 > 10` —— 判 stale，无谓重拉。反向的例子会判 fresh，缓存卡死。偏移量、缺省毫秒、`+00:00` 代替 `Z`、多于 3 位的小数秒，四种都会破坏顺序。

`diffMetadata` 自己的 TSDoc 已经写明「两个值都必须是合法 ISO 8601 格式，比较才正确」——这是对**调用方**的要求，本包就是调用方。

**因此 metadata 的 wire 形式必须规范化**：UTC `Z`、毫秒 3 位，即与 `toISOString()` 完全同形。适配器要么在边界 canonicalize 后再交给 core，要么对不规范的串 fail-fast；**不得直接透传**。

> 坑一的防御（不许解成 `Date`）防不住坑二——一个不规范的**字符串**照样是 `string`，类型检查全绿，`diffMetadata` 照常运行，错的只是结论。

### 错误分类锚定 `isNetworkError`

core 已经把口径冻结在 [`isNetworkError`](../../../packages/rxdb/src/repository/network-error.ts)，该函数的 `@packageDocumentation` 直接点名本故事：

```ts
 * QueryCache 的 `offlineFallback`（US-020 AC#16）与后续的同步重试策略（US-212）。
 * 两处口径必须一致 —— 否则「什么算离线」会在两个地方各自漂移。
```

这两条能写成本包的 AC，前提是[transport 归本包](#责任划分适配器持有-transport)——若由用户的 handler 发请求，本包既控不住错误形态也插不进 `status`，AC#12 / #13 只能退化成对 handler 的文档劝告。owner 定在适配器这边，两条才是可冻结的契约测试。

本包只需满足它的两条硬性输入：

1. **HTTP 响应错误 MUST 带数字 `status`。** 判据第 2 步「拿到了状态码就说明连接是通的」一命中即判非网络错误，401 / 409 / 422 于是自动不会被 `offlineFallback` 吞掉（AC#12）。
2. **传输失败 MUST 抛 `NetworkOfflineError`（core 的类），且不得携带数字 `status`。** 这是判据第 1 步（`instanceof`），是唯一不依赖字符串约定的一条：适配器已经分类过了，core 直接采信。原始 `TypeError` 放进它的 `originalError` 保留现场（构造签名就是 `new NetworkOfflineError(originalError)`）。

**「原样上抛 `TypeError`」不是等价选项，会在 Node 侧漏判。** 判据第 5 步的正则 `FETCH_FAILURE_MESSAGE` 只收了三家浏览器的消息（`failed to fetch` / `networkerror when attempting to fetch` / `load failed` / `network request failed`），而 Node / undici 的 fetch 失败消息是 **`fetch failed`**，一条都不命中；真正的 errno（`ECONNREFUSED` 等）挂在 `error.cause` 上，而判据第 3 步读的是 `error` 自身的 `code`，读不到 `cause`。于是在 vitest（node 环境）、Electron 主进程、Tauri JS 侧，原样上抛的 `TypeError` 会被判 `false`，`offlineFallback` 静默失效，AC#13 直接挂。

**本包是仓库里第一个直接用原生 `fetch` 的适配器**，所以这条只能在本包关掉：supabase 走 SDK，postgrest-js 在 fetch 失败时不 reject 而是返回 `status: 0`，它是靠这个哨兵状态码分类的（见 [`postgrest-error.ts`](../../../packages/rxdb-adapter-supabase/src/postgrest-error.ts) 的 `classify_postgrest_error`），本包没有这个便利。

放宽 core 的正则不是可走的捷径，理由 `postgrest-error.ts` 的 `@packageDocumentation` 已写明：去掉 `instanceof TypeError` 限制后，RLS 或约束错误的 message 里出现 `load failed` 就会被误判成离线。**本故事不改 core**——本包自己分类，是成本最低也最稳的做法。

> 本包沿用的是 supabase 已经付过学费的形状：它此前把包括传输失败在内的所有错误一律包成 `SupabaseDataError`，五条判据一条不中，`offlineFallback` 恒不触发；修复正是改成传输失败抛 core 的 `NetworkOfflineError`。**不得**为「保留更多上下文」再包一层自定义类。

### changelog 方法必须 throw

v1 不实现 Full-sync。`pullChanges` / `mergeChanges` / `getChangeCount` 若返回空，Full/Filter 会以为远端无变更并覆盖本地认知。unsupported throw 是唯一诚实行为。

`pullChangesBatch` 是 `RxDBAdapterRemoteBase` 上的 **optional** 成员，调用点 [`pull-batch.ts`](../../../packages/rxdb/src/version/pull-batch.ts) 做 `if (remoteAdapter.pullChangesBatch)` 特性探测。因此**不实现**才是符合约定的做法（自动回落到同样 throw 的 `pullChanges`）；真正的不变量是「不得返回空数组」，不是「必须实现成 throw」。

### 新错误的判别口径

本故事提到的 `remote_changelog_unsupported` / `unsupported_wire_type` 是**症状名，不是已定的 `code` 字面量**。落地前必须先对齐仓库里并存的三套口径，否则接入方写断言时无从下手：

| 来源                                                                 | 判别位             | 形态                                            |
| -------------------------------------------------------------------- | ------------------ | ----------------------------------------------- |
| 仓库主流（含 core 5 个错误类、supabase 全部错误类）                  | `name`（类名）     | `SupabaseDataError`、`NetworkOfflineError`      |
| supabase 附带的 `code`                                               | `code`（辅助）     | UPPER_SNAKE：`NETWORK_ERROR`、`DATA_ERROR`      |
| [`RxDBError.ts`](../../../packages/rxdb/src/RxDBError.ts) 的唯一特例 | `code`（主判别位） | snake_case：`mixed_versioned_cache_transaction` |

第三行那条**是特例且已声明为特例**——`RxDBError.ts` 原文写着「`code` 是本仓库唯一用错误码而非 `name` 判别的错误：该字符串由 `US-306 FR-046` 指定，跨故事复用，不得改名」。本包若照抄它的 snake_case 形态，就把「唯一」变成「三个」，那句话连同它保护的跨故事契约一起失效。

**本故事的口径**：新错误一律以**类名**判别，需要跨包字符串断言时附带 UPPER_SNAKE 的 `code`，与 supabase 一致。**不新增 snake_case 主判别位。**

| 类名（主判别位）                | 附带 `code`             | 抛出时机                                                                  |
| ------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `HttpChangelogUnsupportedError` | `CHANGELOG_UNSUPPORTED` | changelog / 分支成员被调用（AC#10、#26）                                  |
| `HttpUnsupportedWireTypeError`  | `UNSUPPORTED_WIRE_TYPE` | `connect()` 扫到 bigint / binary（AC#15）                                 |
| `HttpConfigError`               | `CONFIG_ERROR`          | 构造期配置校验失败（AC#31）                                               |
| `HttpUnsupportedOperationError` | `UNSUPPORTED_OPERATION` | `getRepository` / `saveMany` / `removeMany` / `mutations` 被调用（AC#32） |

类名与 `code` 字面量在 plan 可微调，**判别位不可调**。AC 表已统一改用类名——早期版本写的 `remote_changelog_unsupported` / `unsupported_wire_type` 是症状标识，不是 `code` 字面量，勿照抄成 snake_case。

### 协议

- 请求：JSON `RuleGroup` + 实体名 + id 列表 + 翻页参数。不发 SQL，远端不是你的 sqlite。**请求由适配器发出**，handler 只给 URL / method / body。
- 响应：metadata `{ id, updatedAt }[]`（`updatedAt` 为**规范化** ISO 8601 串：UTC `Z` + 3 位毫秒）；实体 JSON 数组。
- bigint/binary 没有本故事定义的 wire codec——实体字段若声明这些类型，阶段 A 抛 `HttpUnsupportedWireTypeError`（AC#15，**单一行为，不给「或拒绝该实体」的第二选项**）。US-018 已经在生成器上为同一类静默丢失付过学费。
- auth：hook 由适配器在发请求前调用并注入 header。401 的错误对象必须带数字 `status`，供 `isNetworkError` 正确分类。

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
| `declare module` 扩 `RxDBAdapters` + 注册解析契约测试        | A    | AC#1。**不是** `inject`——那是插件字段，适配器身上没有       |
| transport 归属契约测试（auth / status / 不包装）             | A    | AC#12 / #13 / #16，断言主体是本包的 transport 而非 handler  |
| 结构隔离契约测试                                             | A    | AC#19                                                       |
| website / [capability-matrix.md](../../capability-matrix.md) | A    | AC#21（含具名适配器计数 9 → 10）                            |
| REST mapping / ETag / SSE / eviction                         | B    | 可选；缺省不得改变阶段 A 语义                               |

本故事关闭前不改 US-203。能力矩阵在包落地后把「待实现 / US-212」行改成已实现。

## References

- [US-020 QueryCache 接入统一 Repository](../core/US-020-querycache-repository.md) — 曾是唯一硬前置，**已于 2026-08-22 全关，两档发布门禁同时解除**
- [US-203 Supabase 适配器](./US-203-supabase-adapter.md) — 翻页/分块与 QueryCache ducks 的对标；不 inherit AC
- [US-201 SQLite 适配器](./US-201-sqlite-adapter.md) / sqlite-core — 独立 local 缓存后端
- [US-015](../core/US-015-plugin-inject-dependency.md) — 插件侧的 `inject: ['adapter:remote']` 会解析到本适配器实例。**本适配器自己不声明 `inject`**（那是插件接口的成员，不是适配器的）
- [US-018](../core/US-018-generator-default-serialization.md) — bigint / binary 静默丢失的同类学费，AC#15 的来源
- [US-306 FR-046](../collaboration/US-306-working-tree-commits.md) — cache 排除在工作树外（兼容，不实现）。
  兼容机制见[技术笔记](#与-epic-006-的关系)：本包不碰 `upsertMany()` / `deleteByIds()`，门禁挂载时对本包是 no-op。
  **不构成双向排期前置**
- [epic-004](../../epics/epic-004-future-features.md)
