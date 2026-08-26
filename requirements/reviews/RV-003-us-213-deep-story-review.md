---
id: RV-003
title: US-213 深度故事评审：offlineFallback 全栈验收不可达
status: Open
created: 2026-08-26
updated: 2026-08-26
pr: # 修复 PR 链接，Resolved 时填
---

# Review：US-213 HTTP wire 集成测试深度评审

## 结论

**不建议按现文开工。** P1 使 AC#13 / AC#15 无法通过故事定义的「RxDB +
`SyncType.QueryCache` 全栈」路径验证；其余 P2 会让测试不稳定、不能证明声称的快照语义，或根本不进入类型门禁。

本评审以源码实证为主：核对 `QueryCachePrimaryRepository`、`QueryCacheRepository`、`FindOptions`、
HTTP 适配器既有 integration fixture 与 Nx target 配置；未运行测试，因为本故事尚未实现测试资产。

## 问题

### P1：`offlineFallback` 的生产全栈验收不可达

故事把 AC#13 / AC#15 指定为方式②，并明确要求观测 `offlineFallback` 是否吞掉缓存命中：
[US-213 AC 表](../stories/adapter/US-213-http-wire-integration-test.md#L67-L73) 与
[AC#13 / AC#15](../stories/adapter/US-213-http-wire-integration-test.md#L91-L93)。

但公开 `FindOptions` 没有 `offlineFallback` 字段；它只声明 `localCacheFirst` 与 `onSyncStats`：

```ts
export interface FindOptions<...> {
  where: U;
  localCacheFirst?: boolean;
  onSyncStats?: (stats: SyncStats) => void;
}
```

见 [`query-options.interface.ts`](../../packages/rxdb/src/repository/query-options.interface.ts#L47-L99)。
生产 `QueryCachePrimaryRepository.find()` 也只从选项中取三项并传给 `#sync()`：

```ts
const { where, localCacheFirst, onSyncStats } = options as QueryCacheFindHints<T>;
await this.#sync({ where, localCacheFirst: localCacheFirst ?? this.localCacheFirst, onSyncStats });
```

见 [`QueryCachePrimaryRepository.find()`](../../packages/rxdb/src/repository/query-cache-primary.ts#L132-L140)。
真正的 fallback 仅存在于内部 `QueryCacheRepository.#wrapWithOfflineFallback()`，且由
`options.offlineFallback` 开启，见 [`QueryCacheRepository.find()`](../../packages/rxdb/src/repository/QueryCacheRepository.ts#L285-L308)
与 [`#wrapWithOfflineFallback()`](../../packages/rxdb/src/repository/QueryCacheRepository.ts#L586-L600)。

因此，方式②无论传不传运行时额外字段，都会在 `QueryCachePrimaryRepository.find()` 被丢弃；直接
`new QueryCacheRepository()` 虽可测试 fallback，却不再是故事承诺的 RxDB 全栈路径。并且写路径本来
就没有 fallback，`create` / `update` / `delete` 都是 remote-then-local，见
[`QueryCacheRepository.create()`](../../packages/rxdb/src/repository/QueryCacheRepository.ts#L397-L408)。

### P2：方式②的本地 fixture 最小契约写错

故事称 `getMetadataByIds` / `upsertMany` / `deleteByIds` 三个方法「正是 core 侧的消费面」：
[US-213](../stories/adapter/US-213-http-wire-integration-test.md#L69-L73)。实际生产装配
`createQueryCachePrimary()` 还必定调用 `localAdapter.getRepository(EntityType)`，其返回的本地 repository
负责查询投影：

```ts
return new QueryCachePrimaryRepository(
  entityName,
  localAdapter.getRepository(EntityType),
  remoteAdapter,
  localAdapter,
  localCacheFirst,
  syncMemo
);
```

见 [`createQueryCachePrimary()`](../../packages/rxdb/src/repository/query-cache-primary.ts#L262-L279)。既有 HTTP
集成 fixture 也包含 `getRepository`、`connect`、`disconnect`、`isTableExisted`、`createTables`、`mutations`
以及 repository 的 `find`，并不只是三个 duck，见
[`createLocalAdapter`](../../packages/rxdb-adapter-http/src/__tests__/integration.spec.ts#L207-L245)。

### P2：server 清理顺序与句柄断言都不可靠

故事要求 `afterAll` 先 `server.closeAllConnections()` 再 `server.close()`：
[US-213](../stories/adapter/US-213-http-wire-integration-test.md#L209-L219)。这会在两调用之间允许新连接进入；
应先发起 `server.close()` 停止接收连接，紧接着调用 `closeAllConnections()`，最后 await `close` 回调。

AC#1 还要求通过 `process.getActiveResourcesInfo()` 断言「本 suite 起的」server / socket 已清：
[US-213 AC#1](../stories/adapter/US-213-http-wire-integration-test.md#L79)。该 API 只给资源类型，不给所有权，
无法在 Vitest 并发与 undici 全局连接池中区分本 suite 的 TCP 句柄。这个 AC 没有稳定的通过判据。

### P2：快照一致性与稳定排序没有可观测用例设计

AC#6 宣称 token 分页「跨页快照一致、排序稳定」：
[US-213 AC#6](../stories/adapter/US-213-http-wire-integration-test.md#L84)。但参考后端给出的故障开关只有
`hang`、`truncateAt`、`forceStatus`、`dropEtag`、`tokenStuck`、`shapeSwitchAt`，没有「首响应后修改活动数据」
的 hook，见 [参考 server 形态](../stories/adapter/US-213-http-wire-integration-test.md#L125-L147)。静态 `Map`
天然看起来稳定，无法证明服务端真的冻结了快照或显式排序；offset 形态同样受协议的快照一致性要求约束。

### P2：`tests/**` 加入 tsconfig 不等于进入类型门禁

故事声称在 `tsconfig.spec.json` 加 `tests/**/*.ts` 后，`tsc` 与 typed lint 就会校验新目录：
[US-213](../stories/adapter/US-213-http-wire-integration-test.md#L228-L237)。但本包 `typecheck` target 实际只跑
`tsc --build tsconfig.lib.json --emitDeclarationOnly`，见
[`project.json`](../../packages/rxdb-adapter-http/project.json#L6-L12)，而 `tsconfig.lib.json` 只 include
`src/**/*.ts`，见 [`tsconfig.lib.json`](../../packages/rxdb-adapter-http/tsconfig.lib.json#L10-L26)。Vitest 也未开启
typecheck。故新增 wire 测试会被执行，却不会在现有 CI 被 TypeScript 严格校验。

### P2：协议或实现缺陷的处置会伪造 AC#17 通过

故事禁止改 `src/`：
[Out of Scope](../stories/adapter/US-213-http-wire-integration-test.md#L47-L55)，又要求若发现协议缺陷就提交
`it.fails` 或 `describe.skip`：
[处置规则](../stories/adapter/US-213-http-wire-integration-test.md#L239-L243)。与此同时 AC#17 把
`pnpm nx test rxdb-adapter-http` 全绿作为关闭条件。expected-fail / skip 能让命令变绿，却不能证明
「后端照文档实现、前端照文档消费可以互通」；若暴露的是适配器实现问题，现有范围更没有闭环路径。

### P3：仍有两个已知文案债

技术笔记仍把 fetch 桩写成 12 处：[US-213](../stories/adapter/US-213-http-wire-integration-test.md#L101-L105)，
但当前实际是 9 处 fetch 桩；并且 In Scope 指向已删除的 RV-001：
[US-213](../stories/adapter/US-213-http-wire-integration-test.md#L40-L45)。两项已由
[RV-002](RV-002-us-213-us-214-story-review.md#L65-L84) 记录，当前仍未解决。

## 根因

- 故事把 `QueryCacheRepository` 的内部能力当成了 `QueryCachePrimaryRepository` 的公开生产能力，未检查两层间的 options 透传。
- fixture 只按 QueryCache 写 duck 列表设计，漏掉生产主仓储对本地 repository 的依赖。
- 分页 AC 只描述最终集合，未安排跨页间的受控状态变化，导致快照与排序只是静态样本上的推断。
- 测试目录纳管只检查了 tsconfig include，未检查 Nx `typecheck` target 实际构建哪个 project。
- 将「测试发现问题」与「故事可以关闭」混为一谈，导致 expected-fail 被当作验收替代品。

## 修复方案

1. 对 P1 二选一：新增前置 core story，把 `offlineFallback` 加到公开 `FindOptions` 并由
   `QueryCachePrimaryRepository` 透传；或者删除 AC#13/#15 中“全栈 fallback”的承诺，仅保留 HTTP 适配器的错误分类测试。
   前者完成前，US-213 应保持 Backlog 或 Blocked，不能把直接构造 `QueryCacheRepository` 说成方式②。
2. 将 `tests/local-adapter.fixture.ts` 的契约改为完整列出本地 adapter 生命周期、`getRepository().find()`
   与三个 QueryCache 写 duck；本地 `find` 必须按 `where` 返回投影，才能用于缓存降级与孤儿语义断言。
3. 修正 `stop()`：先调用 `server.close()`，再 `server.closeAllConnections()`，随后 await close 回调；参考 server
   自己维护 socket `Set` 并在 stop 后断言为空，替代全局资源扫描。
4. 为两种分页形态安排乱序种子和「第一页回包后修改活动数据」的受控 hook；token 必须携带冻结快照标识，
   并断言汇总 id 始终来自首个快照。
5. 新增 spec typecheck target，或让现有 typecheck 构建根 `tsconfig.json`，确保 `tsconfig.spec.json` 真正进入 CI。
6. 删除 `it.fails` / `skip` 作为关闭路径。发现协议或实现缺陷时应建立阻塞 bug；仅在 bug 合并、用例转绿后才允许关闭 AC#17。
7. 一并修复桩计数与 RV-001 失效链接；后者应改为稳定的 `http-protocol.md` 条件请求章节锚点。

## 处置（2026-08-26）

逐条复验后按**最小必要**落地，全部改在 US-213 文档，未动 `src/`：

| 问题                 | 复验                                                                                                                                | 处置                                                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 `offlineFallback` | ✅ 属实。公开 `FindOptions` 无该字段；`QueryCachePrimaryRepository.find()` 只解构 `where` / `localCacheFirst` / `onSyncStats`       | 取修复方案的**后半段**：AC#13 / #15 改为方式 ①，只断言降级**判据**（数字 `status`、`isNetworkError` 判值），降级行为归 US-020 AC#16。**不新增前置 core story**——为一条测试故事改公开 API 属于过度设计，且与本故事「不改 `src/`」的边界冲突。方式 ② 保留给 AC#8           |
| P2 fixture 契约      | ✅ 属实。`createQueryCachePrimary()` 确调 `localAdapter.getRepository(EntityType)`                                                  | 契约改为完整三段（生命周期 / `getRepository().find()` / 三个写 duck）。但**不强制本地 `find` 求值 `where`**——既有替身有明写理由的相反立场，改成写「AC#8 只用一个 `where`」这条约束即可                                                                                   |
| P2 清理顺序          | ✅ 属实。先 `closeAllConnections()` 会在两次调用间放新连接进来                                                                      | 顺序改为 `close()` → `closeAllConnections()` → await 回调；参考后端加 `sockets: Set`                                                                                                                                                                                     |
| P2 句柄断言          | ✅ 属实。`process.getActiveResourcesInfo()` 只报资源类型、不报归属                                                                  | AC#1 改断言参考后端自持的 `sockets` 集合为空                                                                                                                                                                                                                             |
| P2 快照 / 排序       | ✅ 属实。faults 无「首响应后改数据」的 hook，静态 `Map` 上排序稳定恒真                                                              | 加**一个**开关 `mutateAfterPage`，AC#6 补乱序种子与「汇总 id 等于首个快照」的断言；端点表写明 token 必须携带冻结快照                                                                                                                                                     |
| P2 类型门禁          | ✅ 属实，且比原文更严重：`typecheck` 只构建 `tsconfig.lib.json`，根 `tsconfig.json` 无 target 构建，根 eslint **也没开** typed lint | 纳管由三处改四处，新增 `project.json` 的 `tsc -p tsconfig.spec.json --noEmit`；已实测该命令当前 exit 0，不会把存量错误带进门禁。AC#17 一并加上 typecheck                                                                                                                 |
| P2 `it.fails`        | ⚠️ **部分采纳**。「expected-fail 能让命令变绿」属实，但「删除 `it.fails` 作为关闭路径」被驳回                                       | 驳回理由：本故事明禁改 `src/`，要求「bug 合并、用例转绿才能关闭」等于让一张测试票阻塞在与它无关的修复上；`it.fails` 本身是可执行记录（协议一修好它就变红）。改为要求**可追溯**：每条必须带另开故事 id，关闭说明列出条数，AC#17 的「全绿」明确读作「全绿 + N 条明面待办」 |
| P3 桩计数            | ✅ 属实，实为 9 处 fetch 桩                                                                                                         | 两处 12 → 9，并列出分布                                                                                                                                                                                                                                                  |
| P3 RV-001 链接       | ✅ 属实，文件已删                                                                                                                   | 三处改指 `http-protocol.md#条件请求可选`                                                                                                                                                                                                                                 |

## 解决记录

- [x] 缩减 AC#13 / AC#15 至适配器层，并在故事里写明 `offlineFallback` 为何全栈开不出来（不新增前置 core story）。
- [x] 修订 fixture 契约、server 清理顺序与句柄断言、分页快照开关、类型门禁（四处纳管 + `project.json`）。
- [x] `it.fails` / `skip` 保留但要求可追溯，AC#17 关闭条件写死。
- [x] 修复 RV-002 已记录的两项 P3 文案债（桩计数、RV-001 链接）。
- [x] 同步派生视图：`roadmap.md` 的故障开关数与纳管处数。
- [ ] 开 PR 修复（`pr` 字段记录链接）。
- [ ] PR 合并，`status: Resolved`。
