---
id: RV-004
title: Tauri 会话未绑定窗口
status: Open
created: 2026-08-17
updated: 2026-08-17
pr:
---

# Review：Tauri 会话未绑定窗口

## 问题

🔴 High。Tauri 把变更事件广播给整个应用，事件含 `sessionId`；收到 ID 的任一窗口又能对该 session
执行 SQL、提交、回滚或关闭，因为路由器只记录 owner 用于销毁回收，不在请求执行前校验 owner。
多窗口之间因此没有会话隔离，一个窗口可以终止或串改另一个窗口正在进行的事务。

`DesktopHost::new()` 使用全局 `AppHandle.emit()`
（[commands.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/commands.rs#L35)）：

```rust
if let Err(error) = emitter.emit(CHANGE_EVENT, message) {
```

`Host::change_sink()` 明确把 session ID 编进每条事件
（[session.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/session.rs#L178)）。与此同时，
`DesktopRouter::handle_owned()` 先把请求直接交给 host，之后才做记账
（[router.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/router.rs#L77)）：

```rust
let response = match files {
    true => self.files.handle(request),
    false => self.sqlite.handle(request),
};
```

同文件 `DesktopRouter::forget()` 的注释还直接确认“宿主并不校验是谁在关”
（[router.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/router.rs#L152)）。这是源码实证，不依赖猜测 UUID。

## 根因

`owners` 被设计成生命周期清理索引，而不是授权表；事件投递又在 `HostOptions.deliver` 里直接持有
`AppHandle`，绕过了路由器掌握的 owner 信息。两处单看都能工作，组合后 session ID 既公开又不验主。

## 修复方案

把 owner 变成 host 信任边界的一部分：除 `open` 外，每条带 session 的请求在派发前必须验证
`sessionId` 属于当前 window label；跨 owner 请求返回稳定错误，不能进入 SQLite/file host。

事件按 session owner 使用 `emit_to` 定向投递，不再 `app.emit` 全局广播。补两个真实 owner 的路由测试：
第二个 owner 无法 `execute`/`close`/`file.*` 第一个 owner 的 session；变更事件只到目标窗口。Electron
bridge 也应补同一条 ownership 断言，避免把“UUID 不易猜”当授权。

## 解决记录

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
