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

已在 `local-db` 分支落地，等开 PR：

- **Tauri 请求验主**：`DesktopRouter::handle_owned()` 在派发前先过 `reject_foreign_session()`，
  跨 owner 的请求直接返回 `permission_denied`，进不了 SQLite / file host
  - 只拒**属于别人**的会话：查不到持有者的（从没开过、或已经关了）继续放行，由 host 答 `session_closed`。
    两者对调用方含义相反——`session_closed` 是「重连即可」，`permission_denied` 是「别再试了」；
    把前者报成越权等于把一次正常重连变成死结。这条有专门的非回归测试钉着
  - 文件族与 SQL 族分表查：同一个 id 在两族里是两回事，混查会让一条 `file.*` 撞上 SQL 会话的归属
  - 拒绝消息里**不回显持有者的 label**：那是另一个窗口的信息，对发起方没有用处
- **事件定向投递**：`emit` → `emit_to(owner, ...)`，收件人是开出该会话的那个窗口
  - 投递闭包要反查归属，而归属表在路由器里，路由器又要拿这个闭包才能构造。用
    `Arc::new_cyclic` + `Weak` 打破这个环——强引用会让路由器永不释放（它自己的 host 持有那个闭包）
  - 查不到收件人时**不回退广播**：广播正是这里要消除的行为。但也不静默丢——
    事件发不出去在 UI 上表现为「数据没变」，是所有故障形态里最难查的一种，因此三条丢弃路径各留一行日志
  - 死锁复核：`deliver_change` 会锁 `owners`，已逐一确认 `track` / `remember` / `forget` /
    `reject_foreign_session` 都不在持锁期间回调 host，`close_owner` 也先放锁再关会话
- **Electron 补同一条断言**：两族 bridge 在 `host.handle()` 之前先过 `denyForeignSession()`，
  判据与 Rust 侧逐字对应
  - 抽成共用的 `desktop-session-ownership.ts` 而不是两族各抄一份——抄两份，改一份就是另一份悄悄失效
  - 负载未经协议校验，因此对形状不做任何假设：不是对象 / 没有 `sessionId` / 不是字符串，
    一律放行交给 host 报 `protocol_violation`
  - Electron 的**事件投递**原本就是按会话定向的（`targets.get(message.sessionId)`），
    这一侧缺的只是**请求**验主
- 红测先行（7 例）：
  - `router.rs`：跨 owner 的 `execute` / `close` / `file.*` 被拒、同 owner 不受影响、
    未知会话仍答 `session_closed`、`session_owner()` 报出持有者
  - `desktop-sqlite-bridge.spec.ts`：`拒绝另一个窗口的会话，且不在 host 上留下任何痕迹`
    （拒绝后 `openSessionCount` 不变、持有者仍能正常使用）、`未知会话仍然报 session_closed 而不是越权`
  - `desktop-file-bridge.spec.ts`：`拒绝另一个窗口的会话，且不动它持有的任何东西`
    （文件侧尤其致命：跨窗口 `lockRelease` 放掉别人正持有的独占锁，`file.close` 丢掉别人未提交的写入）
- 验证：`cargo test --lib` 129/129 通过、`cargo clippy --all-targets -- -D warnings` 无告警；
  `dev-rxdb-electron` 176/176 通过；`nx affected -t lint test build` 全绿

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
