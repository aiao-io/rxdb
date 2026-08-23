---
id: RV-001
title: supabase 把传输失败包成 SupabaseDataError，QueryCache 的 offlineFallback 在唯一已发布的远端适配器上永不触发
status: Fixed
created: 2026-08-23
updated: 2026-08-23
pr:
---

# Review：supabase 错误分类静默打死 `offlineFallback`

## 问题

`QueryCacheRepository` 的离线降级由 `isNetworkError` 把门，认不出就原样上抛：

```ts
if (!isNetworkError(error)) {
  throw error;
}
```

（[QueryCacheRepository.ts:575](../../packages/rxdb/src/repository/QueryCacheRepository.ts#L575)）

`isNetworkError` 的五条判据（[network-error.ts](../../packages/rxdb/src/repository/network-error.ts)）依次是：`NetworkOfflineError` 实例 → 带数字 `status` 判**否** → `code ∈ NETWORK_ERRNO` → `name ∈ {'NetworkError', 'TimeoutError'}` → `instanceof TypeError` 且命中 fetch 失败消息正则。函数 TSDoc 明写「**默认方向是「不是」**：认不出的错误一律返回 `false`」。

而 supabase 的 `fetchMetadata` 经 `select_all_pages` 翻页，任何一页出错——包括 supabase-js 因连不上而回填的 `error`——一律：

```ts
throw new SupabaseDataError(`${errorMessage}: ${error.message}`);
```

（[pagination.ts](../../packages/rxdb-adapter-supabase/src/pagination.ts)）

`SupabaseDataError` 的判别位是 `name = 'SupabaseDataError'`、`code = 'DATA_ERROR'`（[errors.ts](../../packages/rxdb-adapter-supabase/src/errors.ts)），既无数字 `status`，也不是 `TypeError`：

```ts
export class SupabaseDataError extends SupabaseSyncError {
  constructor(message: string) {
    super(message, 'DATA_ERROR');
    this.name = 'SupabaseDataError';
  }
}
```

⇒ 五条判据一条不中，`isNetworkError` 对 supabase 抛出的**任何**错误恒返回 `false`。断网时配了 `offlineFallback: true` 的查询拿到的不是缓存，是异常。

放大这条的是覆盖面：`isNetworkError` 全仓库只有 `QueryCacheRepository.ts:575` 一个生产消费方，而当前唯一实现 QueryCache remote ducks 的适配器就是 supabase。**这条能力今天在生产路径上等于不存在**，而 [US-020](../stories/core/US-020-querycache-repository.md) 刚把 QueryCache 从空操作变成生产真。

复验方式：读上述四个符号的源码，非文档推理。

## 根因

两处各自成立、但从未对接：

1. **US-020 D11** 把「什么算离线」冻结在 core 的 `isNetworkError`，它对输入形状的要求只写在 TSDoc 里，**没有落成任何适配器侧的 AC**——没有门禁要求一个 `RxDBAdapterRemoteBase` 实现证明自己的错误能被正确分类。
2. **US-203**（`Done`）从头到尾没出现过 `isNetworkError` / `offlineFallback`。它交付时 QueryCache 还是空操作，错误分类没有消费方，`SupabaseDataError` 一把抓在当时是合理的。

US-020 AC#16 判绿用的是 mock，不是真实适配器：

```ts
const networkDown = () => new TypeError('Failed to fetch');
vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(networkDown));
```

（[QueryCacheRepository.cache-quality.spec.ts](../../packages/rxdb/src/__tests__/repository/QueryCacheRepository.cache-quality.spec.ts)）

这条用例证明的是「`isNetworkError` 认得浏览器原生 `TypeError`」——它确实做到了，AC#16 的 ✅ 不是误判。但「supabase 断网 → 命中缓存」这条端到端路径从未被任何用例走过。**用 mock 造的错误形状去验收一条关于错误形状的契约**，是这类缺口的通用成因。

[US-212](../stories/adapter/US-212-http-adapter.md) 已经把这条不变量写给了新 HTTP 包（AC#13 与 Out of Scope 的「把传输失败包进自定义 Error 类」），但只管新包。交付后会出现「新包能降级、老包不能，而老包是唯一在用的」。

## 修复方案

不重开 US-203（`Done`，其 ✅ AC 是历史事实，不改），走缺陷 PR，本记录是真相源。

1. **区分传输失败与远端业务结果。** supabase-js 返回的 `error` 若属于连不上/超时一类，抛 `NetworkOfflineError`（core 已有，`isNetworkError` 第 1 条判据直接命中）；其余仍 `SupabaseDataError`。落点是 `select_all_pages` 与各 duck 的 `throw` 处，不是在 `QueryCacheRepository` 里给 supabase 开特例。
   - 若坚持保留 `SupabaseNetworkError` 这个类，它**必须**带上 `isNetworkError` 认得的判别位（最小改动是 `name = 'NetworkError'`）；现在的 `code = 'NETWORK_ERROR'` 不在 `NETWORK_ERRNO` 里，命不中任何一条。
2. **补一条走真实错误对象的用例**：让 supabase 适配器在模拟断网下真的抛出，把**它抛出的那个对象**喂给 `isNetworkError` 断言 `true`，再断言 `offlineFallback: true` 时返回缓存。禁止再以裸 `TypeError` mock 作为该行为的唯一证据。
3. **把要求写成跨适配器的契约**，否则下一个 RemoteBase 会重犯：任何 `RxDBAdapterRemoteBase` 实现 MUST 保证其抛出的错误能被 `isNetworkError` 正确分类（传输失败判 `true`，远端业务错误判 `false`）。US-212 已为新包写了等价条款，缺的是覆盖既有适配器的落点——建议随本 PR 补进 `isNetworkError` 的 TSDoc 与适配器一致性套件。

## 解决记录

- [x] 修复已实现（三条方案全部落地）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`

### 已落地的改动

判别位选的是 **`status === 0`**，不是嗅探 message。依据在 postgrest-js 自己的代码里：fetch 失败时它**不 reject**，而是 catch 掉 `TypeError` 后返回 `{ error, data: null, status: 0, statusText: '' }`（`PostgrestBuilder` 的 `res.catch`）。于是 `status === 0` ⇒ 连接没建起来；任何非 0 数字 ⇒ 拿到了 HTTP 状态码，401 / 403 / 502 都是远端给出的**回答**。

放宽 core 那条 `FETCH_FAILURE_MESSAGE` 正则（去掉 `instanceof TypeError` 限制）是被否掉的捷径：RLS 或约束错误的 message 里出现 `load failed` 就会被误判成离线，调用方拿到陈旧缓存而不是失败原因。

1. **新增 `packages/rxdb-adapter-supabase/src/postgrest-error.ts`** —— `classify_postgrest_error(response, prefix)`：传输失败 → core 的 `NetworkOfflineError`，其余 → `SupabaseDataError`。`status` 声明为可选，缺失时按「不是传输失败」处理，与改动前行为逐字一致（既有只解构 `{ data, error }` 的调用点零回归）。
   - 埋雷已用专用断言拦住：返回的错误**不得携带数字 `status`** —— `isNetworkError` 第 2 条判据是「带数字 `status` ⇒ 不是网络错误」，把 `status: 0` 挂上去会把这次修复原地抵消。
2. **19 个 `throw` 点改走分类器**：`pagination.ts` 的 `select_all_pages`、`RxDBAdapterSupabase.ts`（含 `executeRetryableWrite` —— 重试耗尽后才分类，传输失败重试到最后仍是传输失败）、`SupabaseRepository.ts`、`SupabaseTreeRepository.ts`。剩余 6 处 `SupabaseDataError` 经核对确非传输失败（3× invalid response data、no row returned、deleted row did not match、`handleRlsCheckFailure`），保持不变。
3. **`SupabaseNetworkError` 标 `@deprecated`**，指向 `NetworkOfflineError`。该类从未被抛出过，且 `code = 'NETWORK_ERROR'` 不在 `NETWORK_ERRNO` 内、`name` 也不在 `NETWORK_ERROR_NAMES` 内，`isNetworkError` 对它一律判 `false`。删除是 breaking change，故保留。
4. **core 侧不再二次包裹**：`QueryCacheRepository.#wrapWithOfflineFallback` 改用幂等的 `toOfflineError`，避免 `NetworkOfflineError: NetworkOfflineError: …` 且 `originalError` 指向中间层丢掉真正起因。
5. **契约写进 `rxdb-adapter.ts` 的 `fetchMetadata` / `findByIds` TSDoc**（与 RV-002 同一处落点），覆盖既有适配器，不再只管新包。
6. **用例落在真实适配器上**，不在 core 的 mock 套件里：新增 `packages/rxdb-adapter-supabase/src/__tests__/querycache-error-contract.spec.ts`，断言对象全部取自适配器**真正抛出的那一个**。含端到端三条：断网 + 有缓存 → 命中缓存；断网 + 无缓存 → `NetworkOfflineError` 且不重复包裹；业务错误 + 有缓存 → 原样上抛不冒充离线。

> 刻意**不**把用例加进 core 的 `contracts/remote-adapter.spec.ts` —— 那套件通篇 `vi.fn`，在那里断言只会验证替身，正是本记录诊断的那个病灶。

验证：新套件 9/9 绿（红→绿，初次运行 4 failed）；`rxdb` 2509 + `rxdb-adapter-supabase` 536 全绿；两包 lint `--max-warnings=0` 通过；`tsconfig.lib.json` 与 `rxdb` 的 `tsconfig.spec.json` 独立 `tsc --noEmit` 干净（supabase 的 spec config 有 8 处**改动前既存**的 TS 错误，均在未触及的文件里）。
