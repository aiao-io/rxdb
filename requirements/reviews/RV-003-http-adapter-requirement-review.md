---
id: RV-003
title: US-212 的注册示例、transport owner 与时间戳规范化未闭合；其余为编辑性同步
status: Open
created: 2026-08-23
updated: 2026-08-23
pr:
---

# Review：US-212 HTTP 远程适配器需求

## 结论

方向成立，范围收敛得当，绝大多数契约（发射契约、翻页 fail-fast 四条、结构隔离、错误分类锚点）**已经写到可实现的精度**，不需要返工。

真正挡住开工的只有三条：注册示例引用了不存在的 API、handler 与 transport 的责任 owner 未定、metadata 时间戳没有规范化形式。其余是小口径补全和文档同步，可以在 plan 阶段顺手关掉，不必阻塞排期。

本记录只登记评审结果，不修改 [US-212](../stories/adapter/US-212-http-adapter.md) 的原始需求。未运行测试；结论来自对 `packages/rxdb` 源码的逐条核对。

> **2026-08-23 复核修订。** 本文件初版列了 11 条（4×P0 + 7×P1）。复核比对源码后撤回 2 条（指控的契约 core 已冻结）、降级 4 条。撤回与降级理由见文末[复核记录](#复核记录2026-08-23)，保留是为了让下次复查不重复提同样的错判。

## 问题

### P0：注册示例引用了不存在的 API

AC#1 用 `createRxDatabase` 注册 `{ adapter: 'http', ...handlers }`（[US-212:185](../stories/adapter/US-212-http-adapter.md#L185)），技术笔记里也出现 `createRxDatabase({ adapters: [...] })`（[US-212:227](../stories/adapter/US-212-http-adapter.md#L227)）。仓库没有这个函数——真实流程是 `new RxDB({ sync: { remote: { adapter: 'http' } } })` 再 `rxdb.adapter('http', factory)` 注册工厂（[RxDB.ts:500](../../../packages/rxdb/src/RxDB.ts#L500)，[Supabase README](../../../packages/rxdb-adapter-supabase/README.md#L56-L89)）。

同一处还有第二个口径错误：`inject: ['adapter:remote']` 被写进本包 In Scope（[US-212:57](../stories/adapter/US-212-http-adapter.md#L56-L58)）与实现文件表（[US-212:307](../stories/adapter/US-212-http-adapter.md#L307)）。`inject` 是 `IRxDBPlugin` 的字段（[rxdb-plugin.ts:97](../../../packages/rxdb/src/rxdb-plugin.ts#L97)），`adapter:remote` 是**插件**用来声明依赖的 token，由 `RxDB` 从 `config.sync.remote.adapter` 反解（[RxDB.ts:779](../../../packages/rxdb/src/RxDB.ts#L779)）。适配器基类上没有 `inject`，现有适配器包也一个都没写。

**后果：** AC#1 与那条「`inject` 契约测试」都无法按真实 API 验收；实现者会去找一个不存在的注册入口。

**这是编辑错误不是设计错误**——真实流程已经存在且稳定，改 AC 文字即可，不需要新设计。

### P0：handler 与 transport 的 owner 未定

阶段 A 把 handler 定义为**用户提供的不透明函数**（[US-212:89](../stories/adapter/US-212-http-adapter.md#L87-L92)），同时又要求适配器保证 auth header 出现在请求上（AC#16）、HTTP 错误带数字 `status`（AC#12）、传输失败原样上抛不包装（AC#13）、远端收到 JSON `RuleGroup` 而非 SQL（AC#2）。

这四条都是**发请求的人**才能保证的。如果 handler 自己 `fetch`，适配器既插不进 header、也管不住它把错误包成什么形状——AC#12/#13/#16 全部落空，只能退化成文档劝告。如果适配器负责发请求，handler 就不是不透明函数，而是纯协议 mapping（给 URL/body、解响应）。

**后果：** 责任边界不确定，AC#2、#12、#13、#16 无法判定归属，两种实现都能声称满足。

这是本次评审唯一需要**做设计选择**才能关掉的条目。

### P0：`updatedAt` 的 wire 形式没有规范化要求

需求只要求 `updatedAt` 是 ISO 8601 字符串（[US-212:63](../stories/adapter/US-212-http-adapter.md#L61-L64)）。但比较端是字典序：

- 远端侧：`diffMetadata` 直接 `remote.updatedAt > localUpdatedAt`（[diff-metadata.ts:90](../../../packages/rxdb/src/repository/diff-metadata.ts#L86-L92)）。
- 本地侧：core 用 `toISOString()` 归一，**恒为 UTC `Z` + 3 位毫秒**（[QueryCacheRepository.ts:191](../../../packages/rxdb/src/repository/QueryCacheRepository.ts#L188-L192)）。

于是远端只要返回 `2026-08-23T18:00:00+08:00`（合法 ISO，实际晚于本地的 `2026-08-23T10:30:00.000Z`），字典序判 `'2'... > '2'...` 逐字符比到第 12 位就得出 `18 > 10` 之外的错误结论——偏移量、缺省毫秒、`+00:00` 写法都会破坏顺序。「合法 ISO 8601」这个约束**不足以**保证字典序等价于时间序。

**后果：** 远端更新被判 fresh，查询照常返回，缓存永久停在旧版本。症状与需求自己在[技术笔记](../stories/adapter/US-212-http-adapter.md#updatedat-必须是-iso-字符串)里描述的 `Date` 事故完全一致——AC#14 只防住了「解成 `Date`」这一种成因，没防住「合法但不规范的字符串」这一种。

### P1：短页终止依赖一条未写明的服务端保证

数组形态以 `rows.length < limit` 终止（[US-212:149](../stories/adapter/US-212-http-adapter.md#L145-L157)）。这条判据成立的前提是**服务端完整执行了 `limit`**。网关限流、DB 代理、服务端自己的 max-rows 都可能返回短页而并非末页，客户端随后把缺席的 metadata id 判成远端删除——正是本故事引用的 PostgREST `max-rows` 病症。

需求已经提供了游标形态作为出路，但没有说明**什么时候必须用它**。`maxPages` 只是客户端循环上限，证明不了服务端没截断。

**修法很轻**：把「返回少于 `limit` 即最后一页 + 稳定排序」写成数组形态的显式 server contract，并写明不满足者 MUST 用游标形态。不需要新增机制。

### P1：构造期配置校验的边界不完整

需求要求 `pageSize > 0`、`maxPages > 0`、`idChunkSize > 0`，并对 `maxEmptyPages` 说明不得为 `Infinity`（[US-212:101-104](../stories/adapter/US-212-http-adapter.md#L93-L105)）。

`> 0` 放过 `1.5`（offset 漂移）、`Infinity`（`maxPages = Infinity` 等于放弃触顶保护）。`NaN` 会让 `> 0` 判 false 因而被拒——这条没问题，但需求没说错误形态。`maxEmptyPages = 0` 的语义写了（不容忍空页），错误类型没写。

**修法**：统一要求 `Number.isFinite` + `Number.isInteger` + 明确上下界，并指定校验失败的错误类型。

### P1：`version()` 的返回来源与 `disconnect()` 的取消语义未定

AC#24 要求四个 `IRxDBAdapter` 必选成员「有明确语义且可测」。其中两个已经有：`connect()` 的职责写清了（配置校验 + AC#15 扫描），`isTableExisted` 写了「按远端资源可达性回答，不得恒 `true`」——core 在连接流程会用它（[RxDB.ts:564](../../../packages/rxdb/src/RxDB.ts#L564)、[:988](../../../packages/rxdb/src/RxDB.ts#L988)），这条判据够写用例。

缺的是另两个：

- `version()` 返回**服务端版本**还是**适配器版本**。有先例可依——supabase 返回服务端版本并在无效响应时抛错（[RxDBAdapterSupabase.ts:150](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L150-L163)）；HTTP 没有等价的 RPC，要么指定一个 endpoint，要么明确返回适配器自身版本。
- `disconnect()` 是否取消进行中的请求。翻页循环可能正跑到第 7 页，不写清就是各实现自定。

### P2：AC#10 的错误码写法与技术笔记的口径不一致

AC#10 写「抛 `remote_changelog_unsupported`」（[US-212:194](../stories/adapter/US-212-http-adapter.md#L194)），字面读像 snake_case 的 `code`。技术笔记已经把口径定死了——以**类名**判别，snake_case 只是症状标识，不新增主判别位（[US-212:277](../stories/adapter/US-212-http-adapter.md#L265-L277)），并说明了为什么：[`RxDBError.ts`](../../../packages/rxdb/src/RxDBError.ts#L97-L102) 的 `mixed_versioned_cache_transaction` 自称是全仓唯一特例。

口径本身没矛盾，是 AC 表的措辞会被误读。**改一行文字即可**：AC#10/#15/#26 改成「抛 `HttpChangelogUnsupportedError`（类名判别，具体名在 plan 定）」。

### P2：阶段 B 的三条 AC 写成了可验收项，但设计未完成

AC#28～30（ETag/304、SSE invalidation、eviction）都需要**跨包状态或 API**：条件请求要有响应缓存的持有者，失效通知要有 core 的入口，eviction 要在不越过「本包不持有 local adapter」边界的前提下删行。三条都只写了期望结果。

不阻塞开工——roadmap 已把阶段 B 排在阶段 A 交付并发布之后（[roadmap:127](../../roadmap.md)）。但「可选」不等于「设计已完成」，写成 ⬜ 可验收 AC 会让人以为只差实现。**标注为「设计待定，进入阶段 B 前先补 owner」**即可。

### P2：epic-004 的前置状态未同步

US-212 与 roadmap 都已按零前置排期（[US-212:31](../stories/adapter/US-212-http-adapter.md#L24-L36)、[roadmap:244](../../roadmap.md)），epic-004 仍写「硬前置 US-020」（[epic-004:41](../../epics/epic-004-future-features.md#L40-L42)）。纯文档漂移，删一句话。

## 根因

1. **注册示例是从别处抄来的、没有对着仓库跑过。** `createRxDatabase` 与 `inject` 两处都是把「概念上的注册阶段」当成了具体 API 名。需求里凡是出现代码形态的地方，都应该能在仓库里 grep 到。
2. **transport owner 是唯一真正的设计缺口。** 一旦 owner 不明确，JSON、auth、status、错误形态这四件事就没法形成单一责任链——它们全都挂在「谁发的请求」上。
3. **时间戳这条是「防住了成因、没防住症状」。** 需求准确记录了 `Date` 事故，但防御写成了针对那一次成因的（不许解成 `Date`），而不是针对症状的（wire 形式必须与 `toISOString()` 可比）。
4. 阶段 B 的「可选」标签掩盖了设计未完成，而不是降低了风险。

## 修复方案

按修改成本排序，前两条是 plan 前必须关的。

### 1. 改正注册口径（编辑，无设计）

- AC#1 改为真实流程：`new RxDB({ sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'http' } } })` + `rxdb.adapter('http', db => new RxDBAdapterHttp(db, options))`，并给出 remote + 独立 local 的完整样例。
- 从 In Scope 与实现文件表删除 `inject: ['adapter:remote']`；本包要保留的是 `declare module` 扩 `RxDBAdapters`。若仍想要一条 inject 相关的契约测试，正确形态是「装了 `inject: ['adapter:remote']` 的**插件**能解析到本适配器实例」。
- 技术笔记里的 `createRxDatabase({ adapters: [...] })` 同步改掉。

### 2. 定死 transport owner（唯一需要决策的一条）

二选一，写进 In Scope：

- **A. 适配器发请求**：handler 降级为协议 mapping（返回 URL/method/body，解析响应体），适配器统一负责 `fetch`、auth header、status 提取、错误分类。AC#2/#12/#13/#16 全部可验收，但 handler 不再是「不透明函数」，措辞要改。
- **B. handler 发请求**：删除适配器对 header/status/网络错误的保证，改成对 handler 的**输入契约**（「handler MUST 在 HTTP 错误时抛出带数字 `status` 的错误；MUST NOT 包装传输失败」），AC 断言改为「适配器把 handler 抛出的错误原样透出」。

推荐 A：AC#16 的「hook 抛错时请求不发出」在 B 下无法由本包保证。

### 3. 规范化 metadata 时间戳

- 规定 wire 形式：UTC `Z`、毫秒 3 位，即 `toISOString()` 的输出形态；或在适配器边界统一 canonicalize 后再交给 core。
- AC#14 补一条用例：远端返回带时区偏移的合法 ISO（如 `+08:00`）时，行为是 fail-fast 或 canonicalize，**不得**直接透传进 `diffMetadata`。

### 4. 补三处小口径

- 数组形态的 server contract：短页即末页 + 稳定排序，写明不满足者 MUST 用游标形态。
- 配置校验：`Number.isFinite` + `Number.isInteger` + 上下界，指定失败时的错误类型。
- `version()` 的返回来源与格式；`disconnect()` 对进行中请求的取消语义。

### 5. 文档同步

- AC#10/#15/#26 的错误码措辞改成类名判别。
- 阶段 B 的 AC#28～30 标注「设计待定：需先指定跨包 owner」。
- 删除 epic-004 中 US-212 的「硬前置 US-020」。

## 复核记录（2026-08-23）

初版的以下条目经源码核对后撤回或降级。记录在此，避免下次复查重复提出。

### 撤回：「写操作只有名字，没有契约」（原 P0）

指控 `create` / `update` / `delete` 没有参数、返回值、失败行为定义。**core 已经冻结了全部三项**：

```ts
// packages/rxdb/src/repository/QueryCacheRepository.ts:59-63
create?<T>(entityName: string, data: T): Observable<T>;
update?<T>(entityName: string, id: string, data: Partial<T>): Observable<T>;
delete?(entityName: string, ids: string | string[]): Observable<void>;
```

remote-then-local 的完整语义也已实现（[:384-460](../../../packages/rxdb/src/repository/QueryCacheRepository.ts#L384-L460)）：远端成功后才 `upsertMany` / `deleteByIds`，方法缺失则 `throw`（AC#4 引的正是这条）。

剩余未定义的只有 **HTTP wire mapping**（用什么 verb、body 形状），而那本就是 handler 实现者的选择，且阶段 B 的 REST 模板会给默认。要求需求层定死 PUT/PATCH 语义属于过度设计。

### 撤回：「ID 类型与 core 不一致」（原 P1）

指控 handler 的 `ids: string[]` 与 `RxDBEntityId = string | number | bigint` 冲突。**core 的 QueryCache 通道本身就是 string-only**：

- [`QueryCacheEntityMetadata.id: string`](../../../packages/rxdb/src/entity/sync-options.interface.ts#L170-L175)
- [`RxDBAdapterRemoteBase.findByIds(entityName, ids: string[])`](../../../packages/rxdb/src/rxdb-adapter.ts#L378)
- [`getMetadataByIds(entityName, ids: string[])`](../../../packages/rxdb/src/rxdb-adapter.ts#L223)

US-212 用 `string[]` 是**遵守 core 契约**。数字主键实体在 QueryCache 下如何工作是 core 的既有问题（若确实存在），不是 US-212 引入的偏差，也不该由本故事负责关闭。

附带的「`findByIds` 返回 `unknown[]` 未校验 id 属于请求块」同样撤回：远端是用户自己的后端，要求适配器逐行反查归属属于防御过度，成本高于收益。

### 降级：分页静默截断 P0 → P1

原文称「需求声称防住假孤儿，实际仍允许大规模假删除」。US-212 提供了游标形态正是为不能保证 `limit` 的服务端准备的，缺的只是「什么时候必须用游标」这句话。补一条 server contract 即可，不是设计缺口。

### 降级：错误码矛盾 P1 → P2

[US-212:277](../stories/adapter/US-212-http-adapter.md#L265-L277) 已明确写「AC 表里出现的 `remote_changelog_unsupported` / `unsupported_wire_type` 按此读作症状标识」。口径已统一，问题只在 AC 表措辞可能被误读。

### 降级：`version()` / `isTableExisted()` P1 → 收窄

`isTableExisted` 的「按远端资源可达性回答，不得恒 `true`」已经够写用例。只保留 `version()` 返回来源与 `disconnect()` 取消语义两项。

### 降级：阶段 B 无 owner P1 → P2

成立，但 roadmap 已把阶段 B 排在阶段 A 交付发布之后，不阻塞开工。改为要求标注「设计待定」。

### 降级：epic-004 前置冲突 P1 → P2

成立，纯文档漂移。

## 解决记录

- [ ] 改正 AC#1 与技术笔记的注册示例；删除适配器身上的 `inject`
- [ ] 二选一定死 transport owner，同步改 AC#2 / #12 / #13 / #16 的断言主体
- [ ] 规定 `updatedAt` 的规范化 wire 形式，AC#14 补时区偏移用例
- [ ] 补：数组形态 server contract、配置校验边界、`version()` / `disconnect()` 语义
- [ ] 文档同步：AC 错误码措辞、阶段 B 标「设计待定」、epic-004 删硬前置
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
