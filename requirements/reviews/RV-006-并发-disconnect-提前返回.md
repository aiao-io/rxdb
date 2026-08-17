---
id: RV-006
title: 并发 disconnect 提前返回
status: Open
created: 2026-08-17
updated: 2026-08-17
pr:
---

# Review：并发 disconnect 提前返回

## 问题

🟡 Medium。`DesktopSqliteClient.disconnect()` 第一次调用一开始就把 `#closed` 设为 `true`，第二次并发调用
看到该标记后立即成功返回，不会等待第一次调用排空在途 SQL、发送 close 和释放文件句柄。第二个调用方
因此可能在数据库仍打开时继续重命名/备份文件，违反 US-207 AC#7 与 US-210 AC#8 的等待语义。

当前实现
（[desktop-sqlite-client.ts](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-client.ts#L268)）：

```ts
if (this.#closed) return;
this.#closed = true;
await this.#tail;
```

现有 `is idempotent` 测试是严格串行的 `await disconnect(); await disconnect()`
（[desktop-sqlite-client.spec.ts](../../packages/rxdb-adapter-desktop/src/__tests__/desktop-sqlite-client.spec.ts#L255)），
无法覆盖并发调用。按代码时序复验：让 transport 的一条 `execute` 挂在 deferred Promise，上线第一次
`disconnect()`，再调用第二次；第二个 Promise 会在 deferred 和 host `close` 之前落定。

## 根因

一个 `#closed` 布尔值同时承担“拒绝新请求”和“关闭流程已经完成”两个不同状态。它能保证不重复发送
close，却不能让所有调用方观察同一个关闭完成时刻；关闭失败后也没有可等待的共同 Promise。

## 修复方案

保留独立的 closing/closed 状态，并缓存唯一的 `#disconnectPromise`。第一次调用创建完整的排空、退订、
close 流程；后续调用全部返回同一个 Promise。关闭失败时所有并发调用看到同一个 rejection，是否允许
重试由明确状态机决定，不能静默当成已关闭。

补 deferred transport 测试，断言两个并发 `disconnect()` 都在 in-flight SQL 与 host close 之后落定，
且 close 只发送一次；再补 close reject 的并发传播用例。

## 解决记录

已在 `local-db` 分支落地，等开 PR：

- `DesktopSqliteClient` 新增 `#disconnectPromise`，`disconnect()` 变成
  `this.#disconnectPromise ??= this.#runDisconnect()` 后 await 同一个 promise；
  原来的排空 / 退订 / close 流程整体搬进 `#runDisconnect()`
- `#closed` 只保留「拒绝新请求」这一个职责，「关闭已完成」由 promise 是否落定表达
- 关闭失败时 promise 缓存为 rejected，并发调用方看到**同一个** rejection；不静默当成已关闭，
  也不自动重试——句柄是否释放没有第二个判据
- 红测先行（`desktop-sqlite-client.spec.ts`）：
  - `makes concurrent disconnects wait for the in-flight SQL and the host close`：
    用 deferred transport 卡住一条 `execute`，断言两个并发 `disconnect()` 都晚于 host close 落定、
    close 只发一次、`openSessionCount === 0`。修复前 `second` 在 `execute` 之前就落定
  - `propagates a failing host close to every concurrent caller`：修复前第二个调用方是 `fulfilled`
- 验证：`rxdb-adapter-desktop` 927/927 通过，lint + build 绿

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
