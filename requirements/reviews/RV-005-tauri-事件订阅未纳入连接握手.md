---
id: RV-005
title: Tauri 事件订阅未纳入连接握手
status: Open
created: 2026-08-17
updated: 2026-08-17
pr:
---

# Review：Tauri 事件订阅未纳入连接握手

## 问题

🟡 Medium。Tauri 的 `listen()` 异步注册，但 `DesktopHostTransport.subscribe()` 同步返回，
`DesktopSqliteClient.addEventListener()` 又无条件返回已解决 Promise。上层 `await` 完成后就会开始建表和
写入，此时底层事件通道可能仍未注册；首批变更会丢失。若 `listen()` 永久失败，`RxDB.connect()` 仍然
成功，demo 只 `console.error`，应用会显示已连接但响应式查询永不刷新，违反 US-210 AC#3。

`createTauriHostTransport().startListening()` 把真实就绪状态保存在 `starting` Promise，但没有暴露给订阅方
（[tauri-host-transport.ts](../../packages/rxdb-adapter-desktop/src/tauri-host-transport.ts#L130)）：

```ts
starting ??= options.listen(TAURI_DESKTOP_CHANGE_EVENT, event => deliver(event.payload)).then(...).catch(...);
```

同函数的 `subscribe()` 调用 `startListening()` 后立即返回取消函数
（[tauri-host-transport.ts](../../packages/rxdb-adapter-desktop/src/tauri-host-transport.ts#L153)）。
`DesktopSqliteClient.connect()` 随即返回 client，而 `addEventListener()` 只是 `Promise.resolve()`
（[desktop-sqlite-client.ts](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-client.ts#L193)、
[desktop-sqlite-client.ts](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-client.ts#L232)）。

现有 transport 测试都会在发事件前 `waitFor(listenCount() === 1)`，并且替身在调用 `listen()` 时就把
handler 放进集合
（[tauri-host-transport.spec.ts](../../packages/rxdb-adapter-desktop/src/__tests__/tauri-host-transport.spec.ts#L90)），
没有覆盖“注册 Promise 未落定时立刻写入”和“注册失败必须让 connect 失败”。

## 根因

共享 transport 接口沿用了 Electron 同步 `ipcRenderer.on()` 的订阅形状，没有为 Tauri 的异步注册表达
ready/error。实现处理了“异步注册期间退订”的资源竞态，却没有处理更重要的“业务开始前订阅必须就绪”。

## 修复方案

让传输层显式暴露订阅就绪 Promise，或允许 `subscribe()` 返回 Promise；
`DesktopSqliteClient.connect()`/`addEventListener()` 必须等待它落定，失败则回滚已开的 session 并让
`RxDB.connect()` reject。多个 client 共享同一条 Tauri channel 时继续复用同一个 ready Promise。

先补两个红测：延迟 `listen` 落定期间发出的首条变更不能丢；`listen` reject 时 connect 必须失败、
host session 必须关闭。不要用延时等待修复，必须把 ready 状态接进类型契约。

## 解决记录

已在 `local-db` 分支落地，等开 PR：

- `DesktopHostTransport` 新增 `subscriptionReady?(): Promise<void>`，就绪状态进了类型契约，
  不靠任何延时等待
  - 选**可选成员**而不是改 `subscribe()` 的返回形状：Electron 的 `ipcRenderer.on` 是同步的，
    `subscribe()` 返回时订阅就已生效，没有可等待的中间态；且 preload 桥接的键集被 e2e 的
    `bridgeKeys` 断言冻结（恰为 `request` / `subscribe`），加不进第三个键。省略即表示「同步就绪」，
    异步建通道的传输层必须实现它——TSDoc 里写死了这条
- `createTauriHostTransport` 把原本只藏在 `starting` 里的注册结果暴露出来：
  `startListening()` 改为返回本次注册的 Promise 且失败时**继续往外抛**（原来在 `.catch` 里就吞了），
  `subscribe()` 把它记进 `ready`，`subscriptionReady()` 返回 `ready`
  - `ready` 与 `starting` 分开：`starting` 在退订收摊或注册失败时被清掉以便重试，
    而等待方要看的是「上一次注册到底成没成」
  - 多个 client 共享同一条 channel 时仍复用同一个 Promise（`starting ??=` 未变）
  - 没人等待时挂一个 no-op `catch`，避免注册失败变成 unhandled rejection（错误已走过 `onListenError`）
- `DesktopSqliteClient.connect()` 在 `subscribe()` 之后 `await #awaitSubscription()`；失败时
  `#abandonSession()` 退订并给 host 发 `close`，再抛 `host_unavailable`（原因挂 `cause`）。
  回滚自身失败不覆盖真正的原因，但也不无痕——拼进错误消息
- `addEventListener()` 改为 `async` 并 `await` 同一个就绪 Promise：正常路径上早已落定，只花一个微任务
- 红测先行（4 例）：
  - `desktop-sqlite-client.spec.ts`：`waits for the transport subscription to become ready before returning`
    （排空微任务+宏任务后 `connect()` 仍未返回）、
    `rejects and closes the half-open session when the subscription cannot be established`
    （`host.openSessionCount === 0`、`listeners.size === 0`、`cause` 为原始错误）
  - `tauri-host-transport.spec.ts`：`exposes subscription readiness that settles when the channel exists`、
    `rejects subscription readiness when the channel cannot be registered`
  - 第一个用例最初是**假绿**：`vi.waitFor` 落定得比 `connect()` 的微任务链还早，
    补了一次 `setTimeout(0)` 排空才真正变红
- 验证：`rxdb-adapter-desktop` 931/931 通过；`nx affected -t lint test build` 11 个项目 / 49 个任务全绿；
  preload 桥接未动，e2e 的 `bridgeKeys` 断言仍是 `['request', 'subscribe']`

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
