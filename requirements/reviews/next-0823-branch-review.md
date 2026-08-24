---
id: branch-review-next-0823
title: next-0823 分支（vs main）全量代码评审
status: Open
created: 2026-08-24
updated: 2026-08-24
pr: # 修复 PR 链接，Resolved 时填
---

# `next-0823` 相对 `main` 分支全量代码评审报告

> **评审对象**：分支 `next-0823` vs `main`（18 个提交 / 114 个文件 / +15,464 −6,909 行）
> **评审方式**：5 个并行评审代理分领域深读 + 本机实测全部关联测试与门禁
> **评审日期**：2026-08-24

## 1. 范围与背景

本分支关闭三条故事，另含一次错误契约改造与一次基线格式迁移：

| 内容                                   | 规模                                       | 说明                                                                                                                             |
| :------------------------------------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| US-212 HTTP 远程适配器                 | 新包 ~4.9k 行（含测试）                    | `@aiao/rxdb-adapter-http`：transport / rest / pagination / chunking / conditional-cache / metadata / config / errors + 9 个 spec |
| US-018 生成器 default 语义             | +179 实现 / +342 测试                      | **破坏性变更**：运行时类型分派序列化，不可表达的值生成期失败                                                                     |
| US-601 子路径 API 基线                 | api-surface.mjs 240 行改动 + 30 份基线重写 | 30 包 44 入口进基线，`@aiao/source` 单一真相源                                                                                   |
| supabase 错误契约（RV-001 落地）       | 15 处分类点 + 新错误分类器                 | 传输失败改为抛 core 的 `NetworkOfflineError`                                                                                     |
| QueryCacheRepository / rxdb-adapter.ts | +27 行                                     | 幂等收敛 + 发射契约文档化                                                                                                        |
| api-baseline / requirements / website  | 30 份 JSON + 14 份文档                     | 格式迁移与故事收口                                                                                                               |

## 2. 验证结果（本机实测，全部通过）

| 验证项                                                      | 结果                                                          |
| :---------------------------------------------------------- | :------------------------------------------------------------ |
| `pnpm nx test rxdb-adapter-http`                            | ✅ exit 0；statements 99.35% / lines 99.77% / branches 97.95% |
| `pnpm nx test rxdb-client-generator`                        | ✅ 337/337 用例绿；包覆盖率 93.42%（utils.ts 95.4%）          |
| `pnpm nx test rxdb-adapter-supabase rxdb`                   | ✅ exit 0（9 任务 5 个实际重跑）                              |
| `pnpm nx typecheck rxdb-adapter-http`                       | ✅ 绿（按仓库惯例单独验证，nx build 不拦 TS 错误）            |
| `pnpm nx lint`（http / client-generator / supabase / rxdb） | ✅ 绿                                                         |
| `node scripts/audit/api-surface.mjs --check`                | ✅ 30 包 44 入口全部与基线一致，2 个资产入口按白名单跳过      |
| `node --test scripts/audit/subpath-inventory.spec.mjs`      | ✅ 15/15                                                      |
| rxdb 基线 3310 行变化                                       | ✅ 核实为**纯格式迁移**：413 个符号前后零增删                 |
| `package-runtime-conditions` 门禁                           | ✅ 8 个包新增的 `@aiao/source` 条件未触发                     |

## 3. 🔴 高危（1 条）

### 3.1 `requestTimeoutMs` 不覆盖响应体读取——慢速 body 可让查询永久挂起

- **位置**：[transport.ts:217-248](../../packages/rxdb-adapter-http/src/transport.ts#L217)（`execute()` 的 `finally { clearTimeout }`）、[transport.ts:91-96](../../packages/rxdb-adapter-http/src/transport.ts#L91)（`assertOk` 的 `response.text()`）、[transport.ts:107-115](../../packages/rxdb-adapter-http/src/transport.ts#L107)（`decodeJson`）、[RxDBAdapterHttp.ts:231-234](../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L231)（`isTableExisted`）
- **问题**：`fetch()` 在响应**头**到达时即 resolve，定时器随即在 `finally` 中被清除；此后所有 body 消费（`text()` / `cancel()`）没有任何超时保护。
- **失败场景**：远端发送 header 后 stall body（slow-loris 式），`response.text()` 永久 pending → `fetchAllMetadataPages` 的 Promise 永不 settle → `forkJoin` 侧查询永久挂起。这正是 AC#34「防挂起」要消灭的症状，只是从「不回 header」换成了「不回 body」。
- **次生问题**：`disconnect()` 恰在 body 读取期间发生时，undici 会让 `text()` 以裸 `AbortError` reject，而该 reject 发生在 `execute` 的 try/catch **之外**，绕过 `classify()` 直接上抛——分类结论碰巧仍对（`AbortError` 不在 `NETWORK_ERROR_NAMES`，不会降级缓存），但破坏了「断开一律 `HttpDisconnectedError`」的文档契约。
- **修法**：把定时器 / abort 信号的存活期延长到 body 完整消费之后（`assertOk` / `decodeJson` / `discardBody` 用 `AbortSignal.any` + `Promise.race` 保证在 `requestTimeoutMs` 内要么读完要么抛 `NetworkOfflineError` 或 `HttpDisconnectedError`）。**TDD 先行**：先补「header 已回、body 不回包」的超时用例与「disconnect 发生在 body 读取期间」的用例（两条当前都无测试）。
- **关联**：与「故事宣称关闭的 AC#34」直接冲突，建议合并前修复。

## 4. 🟡 中危（6 条）

### 4.1 `conditionalRequests` 的适配器层接线零测试（AC#28 只有 transport 级单测）

- **位置**：[RxDBAdapterHttp.ts:368](../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L368)（`conditionalRequests === true ? { maxEntries } : undefined` 的 true 分支 0 覆盖）、`RxDBAdapterHttp.spec.ts`、`integration.spec.ts`
- **问题**：AC#28 的全部行为只在 `transport.spec.ts` 里直接 `new HttpTransport({ conditional })` 验证。适配器的接线——`#createTransport()` 传参、`disconnect()` 调 `clearConditionalCache()`、`connect()` 重建 transport 时保留条件配置——没有任何端到端用例；disconnect→connect 重连生命周期（[RxDBAdapterHttp.ts:154-160](../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L154) 的重新武装 + 「校验通过才重新武装」语义）同样完全未冻结。
- **失败场景**：`#createTransport` 把条件参数拼错（如传成 `{enabled: false}`）、或重构 `connect()` 时漏掉换新 `AbortController`，现有测试全绿。
- **修法**：补三条端到端用例——① `conditionalRequests: true` 下两次 `fetchMetadata` 第二次带 `If-None-Match`；② disconnect 后 connect，`fetchMetadata` 恢复可用；③ disconnect 后条件缓存被清空（重连后首请求不带条件头）。

### 4.2 supabase 传输失败错误类型变更无迁移声明（已发布包的用户面变更）

- **位置**：[RxDBAdapterSupabase.ts:156, 263-266, 316, 347, 400, 507, 531, 544, 667-670, 962](../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L156)、`SupabaseRepository.ts:113, 152, 176, 206, 221`、`SupabaseTreeRepository.ts:123, 269, 346`、`pagination.ts:74`
- **问题**：所有走 `classify_postgrest_error` 的公开方法，传输失败时抛出的类型从 `SupabaseDataError`（`code: 'DATA_ERROR'`）变成 core 的 `NetworkOfflineError`。这是 RV-001 的必然代价，但 `rxdb-adapter-supabase` 是已发布包。
- **失败场景**：外部消费方写 `catch (e) { if (e instanceof SupabaseDataError) toast(e.message) }`——断网时 `NetworkOfflineError` 不命中任何分支，变成未处理的 rejection。仓库内部无此类消费点（已 grep 验证），CI 不会暴露。
- **修法**：在 CHANGELOG / 迁移说明中显式标注「传输失败现抛 `NetworkOfflineError`，请用 `isNetworkError` 判离线，不要按 `SupabaseDataError` 捕获网络失败」；同步更新 `SupabaseRepository` 各 `@throws`（见 5.1）。

### 4.3 supabase 最复杂的新逻辑 `executeRetryableWrite` 重试耗尽后分类零测试

- **位置**：[RxDBAdapterSupabase.ts:645-671](../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L645)（`lastStatus` 追踪 + 循环后 `classify_postgrest_error`）
- **问题**：新 spec 只走 `fetchMetadata` / `findByIds` 两条路径。本次改动的**全部**其余分类点（`executeRetryableWrite`、`SupabaseRepository` 五方法、`SupabaseTreeRepository` 三处、`version` / `pullChanges` / `isTableExisted` 等）没有任何测试。尤其是混合重试场景（第 1 次传输失败 status 0 → 重试 → 末次 RLS 403）要求按**最后一次**响应分类，这个行为没有用例锁定。违背 TDD 铁律。
- **失败场景**：有人重构把 `lastStatus = status` 挪到 `break` 之后或误删，传输失败重试 3 次后仍抛 `SupabaseDataError`，`offlineFallback` 静默重新失效——现有测试全绿。
- **修法**：补 3 个用例——(a) `mutations`/`saveMany` 传输失败 → `isNetworkError` 为 true 且无数字 `status`；(b) 业务 403 → 仍是 `SupabaseDataError`；(c) 重试混合（先 status 0 后 403）→ 按最后一次分类为业务错误。

### 4.4 `createRestHandlers` TSDoc 默认模板表与实现不符

- **位置**：[rest.ts:331](../../packages/rxdb-adapter-http/src/rest.ts#L331)（文档表 `isTableExisted | HEAD | :entity | 否`）vs [rest.ts:123](../../packages/rxdb-adapter-http/src/rest.ts#L123)（`isTableExisted: { method: 'HEAD', placeholders: ENTITY_ONLY, closable: true }`，无 `path`）与 [rest.ts:213-216](../../packages/rxdb-adapter-http/src/rest.ts#L213)（`path === undefined` 即跳过、不产出 handler）
- **失败场景**：接入方按文档表写 `templates: { isTableExisted: {} }`，期望得到「默认 HEAD `:entity`」——实际静默跳过，适配器回落到 `onFetchMetadata` 的 `limit: 1` 探测。两条路径网线上都可能是 2xx，接入方无法察觉自己配的探测端点从未被使用。
- **修法**：表里 `:entity` 改为 `—`（与 `version` 行同口径），或真给一个默认路径；website 文档若照抄此表需同步。

### 4.5 `connect()` 不中止旧一代在途请求

- **位置**：[RxDBAdapterHttp.ts:154-160](../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L154)
- **问题**：在未先 `disconnect()` 的情况下再次 `connect()`，旧一代在途请求持有的旧 signal 永不会被未来的 `disconnect()` abort，`requestTimeoutMs` 是它们仅剩的终止手段；同时构造器已创建过 transport，首次 `connect()` 又无条件重建一份。
- **失败场景**：孤儿化请求不可再取消（core 主路径按 adapter 去重 `connect()` 不会触发，但插件 `install` 期间同步回调 `connect()` 的路径值得留意）。
- **修法**：`connect()` 中先 `this.#disconnected.abort()` 旧控制器再换新，或在语义上明确「重复 connect 等价于先 disconnect」。

### 4.6 `JSON.stringify` 失败与非法 header 被误判为「离线」，且两条路径形态不一致

- **位置**：[transport.ts:155](../../packages/rxdb-adapter-http/src/transport.ts#L155)（条件路径：`serializeBody` 在 `execute` 之外，裸 `TypeError`）vs [transport.ts:240](../../packages/rxdb-adapter-http/src/transport.ts#L240)（直连路径：在 `execute` 的 try 内，被 `classify()` 包成 `NetworkOfflineError`）；[transport.ts:237-247](../../packages/rxdb-adapter-http/src/transport.ts#L237)（fetch 构造 headers 抛出的 `TypeError` 落入兜底）
- **失败场景一**：`create`/`update` 的 payload 深层嵌套 bigint（AC#15 连接期扫描只覆盖实体 `propertyMap` 顶层，不覆盖用户动态塞入的嵌套值）——直连路径被包成 `NetworkOfflineError`，`isNetworkError` 判 true，调用方看到「离线」而非「数据不可序列化」，排查方向完全错误；条件路径同一份数据抛裸 `TypeError`，两处规则分叉。
- **失败场景二**：auth hook 返回含 CRLF 的 header（fetch/undici fail-closed 抛 `TypeError`，注入本身被挡住）或 `spec.headers` 值类型写错——这类**配置/认证 bug** 被兜底成离线，`offlineFallback` 可能静默回退陈旧缓存，真实故障被吞。
- **修法**：在 `sendJson`/`execute` 公共入口统一做一次序列化（失败抛业务错误，不带 `status`、不属 `NetworkOfflineError`），两处只消费同一份字节串；headers 先经 `new Headers()` 校验再传入 fetch。

## 5. 🟢 低危（按领域合并列出）

### 5.1 supabase 适配器

- [rxdb-adapter.ts:402](../../packages/rxdb/src/rxdb-adapter.ts#L402) 新增 TSDoc 的 `{@link RxDBAdapter.fetchMetadata}` 引用不存在的符号（仓库只有 `RxDBAdapterBase` / `RxDBAdapterLocalBase` / `RxDBAdapterRemoteBase`）；`:364` 的 `#syncQuery` / `#syncAndReadLocal` 在 `QueryCacheRepository` 中也不存在（实际是 `#executeFindQuery` / `findById`）。契约文字内容正确，实现方按文档找私有方法会扑空。
- `SupabaseRepository.ts:76, 139, 165, 192, 217` 的 `@throws {SupabaseDataError}` 与实现漂移——传输失败现在抛 `NetworkOfflineError`，应改双 `@throws` 或引用 `classify_postgrest_error`。
- [postgrest-error.ts:52-54](../../packages/rxdb-adapter-supabase/src/postgrest-error.ts#L52) 的 `is_transport_failure` 仅凭 `status === 0`：postgrest-js 把 fetch rejection **包括 `AbortError`**（手动取消或超时）统一返回 status 0。core 的 `NETWORK_ERROR_NAMES` 特意排除 `AbortError`（「取消静默变成返回缓存」正是要防的事），此分类器在这一层把取消也翻成 `NetworkOfflineError`。当前不可达（supabase 适配器无 AbortSignal 接线，已验证），但属契约地雷；修法：排除 `error.message` 以 `AbortError:` 开头的响应，或在注释写明「本适配器不传 AbortSignal」的硬约束。

### 5.2 HTTP 适配器实现

- [pagination.ts:109](../../packages/rxdb-adapter-http/src/pagination.ts#L109)：数组形态 offset 推进用 `rows.length` 而非 story 规定的 `offset += limit`。服务端无视 limit 多返回行时 offset 跳跃、**静默跳过中间段 id**（假孤儿且无报错）。
- [errors.ts:235-244](../../packages/rxdb-adapter-http/src/errors.ts#L235)：错误消息内嵌完整 URL，handler 自己拼的 query token 会进日志/监控。建议只留 pathname，或文档明确「token 只能经 auth hook」。
- [RxDBAdapterHttp.ts:461-465](../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L461)：`baseUrl` 只校验非空不校验 scheme，配置错误推迟到首次请求才以「离线」面目失败。
- [RxDBAdapterHttp.ts:198-200](../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L198)：`version()` 的 `handler.parse` 返回值无运行时校验（类型层挡不住运行时违约）。
- [pagination.ts:115-122](../../packages/rxdb-adapter-http/src/pagination.ts#L115)：游标值不做 string 校验，数字游标与字符串混用时 `===` 比较出现「看似推进实则循环」边界。
- [rest.ts:289-295](../../packages/rxdb-adapter-http/src/rest.ts#L289)：render 兜底抛错分支不可达且无测试，触碰 AGENTS.md「无 fallback 兜底」铁律。

### 5.3 HTTP 适配器测试

- `sendVoid` 的非 2xx 错误路径（delete duck 收 500 应抛 `HttpResponseError`）无测试。
- 超时与断开竞态的分类优先级（`transport.ts:281-291`，`timedOut` 优先于 `disconnectSignal.aborted`，注释自述「分错的代价不对称」）无用例。
- auth header 不进请求指纹的设计担保（conditional-cache 模块头声明的核心取舍）无测试。
- conditional-cache 三条文档化语义无测试：条目被逐出后闭包仍可用、`clear()` 不清 in-flight、同键覆盖刷新 recency。
- `integration.spec.ts:394-414` OPFS 测试只断言「indexedDB.open / getDirectory 未被调用」，不断言写操作真的执行了。
- `rest.spec.ts:278-284` 的 `expect(fetchMock).not.toHaveBeenCalled()` 恒真（纯同步工厂无 fetch 路径），属装饰性断言。
- `RxDBAdapterHttp.spec.ts:328-331` 与 `:305-308` 完全重复（同一 adapter、同一 404、同一断言）。
- [RxDBAdapterHttp.spec.ts:524-530](../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.spec.ts#L524) 结构隔离源码扫描用非递归 `readdirSync`，实现移入 src 子目录即静默失效。
- `config.spec.ts` 漏测 `conditionalCacheSize: 0` 非法与「显式 `undefined` 当没传」的 JSDoc 承诺。
- `package.json:59` 的 `@aiao/rxdb-test` devDependency 无任何 spec 引用。

### 5.4 审计脚本与 CI

- [subpath-inventory.spec.mjs:20-25](../../scripts/audit/subpath-inventory.spec.mjs#L20) 的 main-only fixture **假绿**：`exports["."]` 与硬编码路径指向同一文件，将来实现改为「读 `exports["."]`」测试照绿。fixture 的 `"."` 应指向别的文件。
- [subpath-inventory.mjs:82](../../scripts/audit/subpath-inventory.mjs#L82)：`@aiao/source` 路径无包目录约束，可写成 `../../rxdb/src/index.ts` 逃逸到别的包（文件存在即通过）。
- [scripts/README.md:345, 411](../../scripts/README.md#L345)：把 added-only（仅新增导出）写成「仅打印警告」，实现实际 `exit 1` 拦 CI——文档与门禁相反，会诱导「按文档修脚本」拆掉基线漂移门禁。
- api-surface.mjs 新增 ~100 行逻辑（`loadBaseline` 格式拒绝、`serialize`、`diffEntries`、双模式入口规划）没有任何 spec，`scripts/audit/` 下六个脚本独缺它。
- 新包缺 `tsconfig.base.json` paths 条目（`@aiao/rxdb-adapter-http`）：今天无跨包引用不炸，第一个跨包 import 到来时 TS 落到 node_modules → dist，api-surface 可能报「re-export 目标缺失」。
- `serialize` 用 `localeCompare` 排序：非默认 ICU 环境下基线条目顺序可能抖动（只制造 git diff 噪音）。

### 5.5 生成器（US-018）

- 数组项 `undefined` / `symbol` 从「静默变 null」变成生成期抛错（[RxDBClientGenerator.utils.ts:381-383](../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts#L381)），这是**真实的用户可见破坏面**，但 G2.1 与迁移表都只写了「`default: undefined` 跳过」一种形态；且该抛错路径零测试覆盖。
- `Date` 子类被静默降级成 `new Date(...)`（[utils.ts:397-400](../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts#L397)），与 `Uint8Array` 子类的显式拒绝（`Object.getPrototypeOf` 检查）自相矛盾，理由同构。
- 跨 realm 值（vm / iframe / jsdom）的 `instanceof` 分派与 `isPlainRecord` 判据都会误判，且错误信息自相矛盾（「holds a Date instance. Only … valid Date values can be generated」）。
- 生成代码 JSDoc 的 `@default` 对 Date 仍写 `new Date()`（当前时刻），与本次特性的字面量时刻语义冲突；该分支覆盖率 0。
- 测试盲区：`symbol` / 数组内 `undefined` 抛错路径零覆盖；AC#4 的「可编译」断言未落地（只有 `toContain` 字符串断言，未用现成的 `compileGeneratedConsumer` 助手）；AC#8 只测了 `MANY_TO_ONE`；AC#9 的 getter 探针被 `omit` 的展开提前剥离，结构上锁不住它声称守护的「遍历方式放宽」——该用例只锁住了 `omit` 用展开实现这一事实。
- 文档笔误：需求文档称「28 条用例」，实际 spec 29 条。

### 5.6 需求文档两处自相矛盾（评审中直接核实）

- [roadmap.md:93](../../requirements/roadmap.md#L93) 写「仓库还剩 **14 条**未关闭故事（2 In Progress + 1 In Review + 11 Backlog）」——实际 YAML 统计是 **11 条**未关闭（44 Done + 2 IP + 1 IR + **8** Backlog = 55）。数字过期，且与同文件「本表其余 11 条未关闭故事」的口径互相矛盾。
- [status-overview.md:175](../../requirements/status-overview.md#L175) 的 US-212 子条目仍写「🚧 ETag、SSE、eviction（AC#28～30，设计待定）」——与同页上一行「AC#28 已实现并关闭、AC#29/30 已移出、34 条 AC 全绿、故事 Done」直接矛盾，子条目漏改。

## 6. 流程问题

18 个提交中 **16 个 message 是「123」占位**，只有 2 个有语义（`feat(rxdb-client-generator)!`、`docs: US-020`）。三个故事关闭、一条破坏性变更、一个 4.9k 行新包，与仓库 speckit-git-commit 约定不符。提 PR 前建议 squash / 重写提交信息。

## 7. 总体结论与合入建议

**结论：质量高，可以合并，但建议先修 3.1。** 五个评审代理一致认为这批代码的架构与工程水准高于仓库平均：

- 错误分类与 core 的 `isNetworkError` 五条判据逐条咬合（`NetworkOfflineError` 不挂数字 `status`、`SupabaseDataError` 不误中判据，均已验算）；
- 「transport 归适配器、handler 是纯协议 mapping」的责任切分清晰，结构隔离不变量（roadmap 约束 11 / AC#19）落实到位；
- 用 `from(promise)` 结构性满足「单次发射 + complete」发射契约；304 语义自证缓存有效性的论证成立；
- 破坏性变更的迁移表与实现逐字一致，错误信息带实体名/字段名/键路径、不泄漏函数源码；
- QueryCacheRepository 改动为幂等收敛，不改变缓存语义、不吞错；
- CI 移除的「Subpath inventory gate」经查实是**假门禁**（脚本无 CLI 入口、一直静默 exit 0），合并进 API surface gate 是正向修复。

**合入前最小动作清单**：

- [ ] 修 3.1：超时/信号覆盖响应体读取（TDD 先行补两条红用例）
- [ ] 补 4.1 的三条适配器层端到端用例（conditionalRequests 接线 + 重连）
- [ ] 补 4.3 的三条 `executeRetryableWrite` 分类用例
- [ ] 4.2：迁移声明写入 CHANGELOG / 迁移文档
- [ ] 修 4.4（TSDoc 表）、4.6（序列化统一出口）
- [ ] 修 5.6 两处过期文档
- [ ] 重写提交信息（或 PR 描述中说明）

其余低危项可按 [README.md](README.md) 的 RV 工作流拆成独立记录跟踪（注意 `RV-001` / `RV-002` 编号已被 capability-matrix 引用）。
