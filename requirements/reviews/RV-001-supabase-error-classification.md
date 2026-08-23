---
id: RV-001
title: supabase 把传输失败包成 SupabaseDataError，QueryCache 的 offlineFallback 在唯一已发布的远端适配器上永不触发
status: Open
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

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
