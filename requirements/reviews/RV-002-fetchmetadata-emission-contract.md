---
id: RV-002
title: fetchMetadata 必须单次发射并 complete 是 forkJoin 强加的承重契约，但没写在任何面向适配器作者的文档里
status: Fixed
created: 2026-08-23
updated: 2026-08-23
pr:
---

# Review：`fetchMetadata` 的发射契约无处可查

## 问题

`QueryCacheRepository` 用 `forkJoin` 并联远端 metadata 与本地行（[QueryCacheRepository.ts:333](../../packages/rxdb/src/repository/QueryCacheRepository.ts#L333) 与 `:605` 两处）：

```ts
return forkJoin({
  remoteMetadata: this.remoteAdapter.fetchMetadata(this.entityName, options.where),
  localRows: this.#readLocal(options.where)
}).pipe(switchMap(...));
```

`forkJoin` 的两条语义于是成为适配器的硬约束：

1. **只保留最后一次发射。** 翻页若实现成「每翻一页 `emit` 一次」，core 只看得到最后一页，前面所有页的 id 全部缺席 → 在 `diffMetadata` 里被判成远端已删除 → **大规模假孤儿**。叠加 US-020 阶段 B 已交付的真 `deleteByIds`，会把还活着的远端行从本地缓存抹掉。
2. **要求上游 `complete`。** 不 complete 的 Observable 会让 `forkJoin` 永久挂起：查询既不返回也不报错，比返回错数据更难定位。

而抽象声明对两条都沉默（[rxdb-adapter.ts:359](../../packages/rxdb/src/rxdb-adapter.ts#L359)）：

```ts
abstract fetchMetadata(entityName: string, query: RuleGroup<unknown>): Observable<QueryCacheEntityMetadata[]>;
```

`Observable<T[]>` 这个类型对「发几次」「会不会结束」不作任何承诺，而每页一发正是 Observable 里最自然的写法。

现有 supabase 实现满足契约纯属结构巧合：`RxDBAdapterSupabase.fetchMetadata` 用 `from(promise)` 包 `select_all_pages`，`from(Promise)` 天然单发射 + complete。**没有任何一行文档或测试要求它这样**，改写成流式翻页不会触发任何门禁。

值得注意的是，这与 US-212 花大篇幅防的 PostgREST `max-rows` 静默截断是**同一症状、不同成因**：那份故事把「截断的 id 不得被当成远端已删除」写进了多条 AC，却没有一条覆盖「发射语义导致的截断」。

复验方式：读上述三个符号的源码，非文档推理。

## 根因

契约存在于**调用点的算子选择**里，而不是被调用方的签名或文档里。`forkJoin` 是 `QueryCacheRepository` 的内部实现细节，适配器作者没有理由去读它——但它单方面决定了适配器必须怎么发射。

仓库当前也没有一份面向适配器作者的 `fetchMetadata` 契约文档：`specs/001-working-tree-commits/contracts/adapter-contract.md` 的范围是 epic-006 的工作树与写入口，不覆盖 QueryCache ducks。

## 修复方案

1. **写进抽象声明的 TSDoc**（[rxdb-adapter.ts](../../packages/rxdb/src/rxdb-adapter.ts) 的 `fetchMetadata` 与 `findByIds`）：MUST 恰好发射一次（值为全部分页拼接后的全量），MUST `complete`；并说明违反的两种后果（假孤儿 / 永久挂起）。同处标注调用点用的是 `forkJoin`，让读者能一跳复验。
2. **加一条适配器一致性用例**：订阅 `fetchMetadata` 返回的 Observable，断言**发射计数 === 1** 且收到 `complete`。注意断言必须是计数，不能是「最后一次的内容对」——每页一发也能让后者通过，这正是要拦的实现。
3. **US-212 已同步收口**：新包的 AC#23 直接冻结这条，阶段 B 的 SSE（AC#29）明确只能触发下一次查询、不得把 `fetchMetadata` 变成长连接流。本记录负责的是既有 supabase 适配器与 core 侧文档。

## 解决记录

- [x] 修复已实现（两条方案落地，第 3 条属 US-212 范围）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`

### 已落地的改动

与 [RV-001](./RV-001-supabase-error-classification.md) 同一 PR —— 两者的落点重合（`rxdb-adapter.ts` 的 TSDoc 与同一个新建的 supabase 用例文件），分开改会互相冲突。

**复核时发现本记录漏了第三个消费方**：除 `QueryCacheRepository` 的两处 `forkJoin` 外，[query-cache-primary.ts:238](../../packages/rxdb/src/repository/query-cache-primary.ts#L238) 的 `#fetchMetadata` 用的是 `firstValueFrom`。两者语义**正好相反**——`forkJoin` 只保留**最后一次**发射且不 `complete` 就永不产出；`firstValueFrom` 只取**第一次**发射且不要求 `complete`。逐页发射会让前者静默丢掉除末页外的全部元数据（进而误判成 orphan 并驱逐本地缓存），让后者只看到首页。这使「恰好一次」成为唯一能同时满足两者的实现，比原记录论证的更硬。

1. **契约写进 `rxdb-adapter.ts` 的 TSDoc**：`fetchMetadata` 处完整列出两条 MUST（恰好发射一次全量 + `complete`；传输失败可被 `isNetworkError` 判 `true`），并点名三个调用点各自用的算子，读者一跳可复验；`findByIds` 处引用同一契约（`ids` 分块查询同样要合并后再发）。
2. **一致性用例**落在真实 supabase 适配器上：`querycache-error-contract.spec.ts` 的 `RV-002` 段订阅 `fetchMetadata` 并断言 `emissions === 1` 且收到 `complete`。断言是**计数**而非「最后一次内容对」——后者在每页一发的实现下同样成立，那正是要拦的实现。
3. **US-212 的 AC#23 / AC#29 不动**，新包的收口已在该故事内。

验证同 RV-001：新套件 9/9 绿，`rxdb` 2509 + `rxdb-adapter-supabase` 536 全绿，lint 与 typecheck 干净。
