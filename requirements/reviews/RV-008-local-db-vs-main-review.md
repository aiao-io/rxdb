---
id: RV-008
title: local-db 相对 main 的全量代码复审
status: Open
created: 2026-08-18
updated: 2026-08-18
pr:
---

# Review：`local-db` vs `main`

**判定：🟡 修完 P1 可合并。** 复审的 7 条 finding 逐条对着代码复核后全部成立，没有臆测项；但初判的严重度整体偏高，真正卡合并的是 #1 与 #6 两条。#1/#2/#4/#6 已在本轮修复并补上回归测试，#3/#5/#7 降级为 follow-up。

## 范围

| 项                 | 值                                                                   |
| ------------------ | -------------------------------------------------------------------- |
| 分支               | `local-db`（评审基线）；修复落在 `next-111` = `local-db` + 6 commits |
| 对比基线           | `main...local-db`                                                    |
| merge-base         | `91cb5a1`                                                            |
| 变更量             | 216 文件，+10356 / -1489                                             |
| 相对 `main` 提交数 | 57                                                                   |
| 工作区             | 干净                                                                 |
| 静态检查           | `git diff --check main...HEAD` 通过                                  |

## Findings

### 1. P1：Electron 锁会重新授予正在关闭的会话 —— ✅ 已修复

[electron-file-host.ts:429](../../packages/rxdb-adapter-electron/src/electron-file-host.ts#L429)

`closeSession()` 原先先释放已持有锁并在每把锁上调用 `pump()`，之后才执行 `dropWaiters(sessionId)`。当同一会话既持有某文件锁、又排队申请同名锁时，`pump()` 会先把锁授予正在关闭的会话。会话随后从 `sessions` 删除，新的锁既不在旧快照中，也不再能被 `dropWaiters()` 回收，其他窗口会永久等待。

最小复现结果：`regranted=file.lockAcquire, trackedLocks=1, secondSession=blocked`。

**这条有仓库自身的书面佐证**：Rust 侧 [locks.rs:150-154](../../packages/rxdb-adapter-tauri/rust/src/file/locks.rs#L150-L154) 的 `LockTable::drop_session` 注释一字不差地描述了 TS 侧这条路径 ——「TS 侧先放持有的锁，那一步的 `pump` 有可能把锁授给这个正在关闭的会话自己还排着的申请」。两端顺序本就该一致，TS 侧是欠的那一半。

**修复**：`dropWaiters()` 提到释放持有锁之前，与 Rust 侧同序。回归用例 `denies a closing session its own queued lock instead of granting it on the way out`（含 `trackedLockNameCount` 归零断言）。

### 2. P2（初判 P1）：`file.writeBegin` 与关闭并发时泄漏 fd 和临时文件 —— ✅ 已修复

[electron-file-host.ts:526](../../packages/rxdb-adapter-electron/src/electron-file-host.ts#L526)

`beginWrite()` 在多个 `await` 后才把 `FileHandle` 放入 `session.writes`。窗口销毁触发 `closeSession()` 时，会话已经从表中删除，并且只扫描当时已有的写入；异步的 `beginWrite()` 随后仍可把句柄写回这个脱离宿主的 session。之后 `closeAll()` 和 `file.writeAbort` 都找不到它。

实测并发 `writeBegin` / `file.close` 后，两个请求都成功、`openSessions=0`，但磁盘留下 `.rxdb-tmp`。

**降级理由**：泄漏的量是「每次撞上竞态一个 fd + 一个临时文件」，且临时文件在下次启动的清扫里就会消失。原文「持续耗尽宿主 fd」只在**恶意 renderer 反复制造竞态**时成立，正常使用下不是 P1。

**修复**：`FileSession` 加 `closed` 标志，`beginWrite()` 在句柄就位后判定会话是否已被回收；已回收就地 `discardWrite()` 并报 `session_closed`。未采纳原建议的「对 session 的操作串行化」—— 那会给每条文件请求加一道全局队列，代价远大于这条竞态。回归用例 `discards a write whose session closed while it was being opened`。

### 3. P3（初判 P2）：启动临时文件清扫可能删除当前进程正在写的文件 —— ⏭ follow-up

[desktop-file-bridge.ts:152](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L152) 启动递归后台清扫，而请求路径不等待 `whenSwept`。递归清扫已有目录期间，新会话可以创建同后缀的临时文件，随后被清扫逻辑误删。

**降级理由**：清扫在 bridge 创建时启动，早于窗口加载与 renderer 建库若干个数量级；且 [该函数注释](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L118-L128) 已论证过误删的后果是一次**报出来的** `file_not_found`，不是静默的坏数据。

**若要修**：在 `handle` 开头 `await whenSwept` 即可（一行，只延迟首条请求）。原建议的「只清扫创建 bridge 时拍下的不可变文件快照」是过度设计，不采纳。

### 4. P2：Electron/Tauri 都有「窗口销毁后才登记会话」的竞态 —— ✅ Electron 侧已修复

Electron 在 [desktop-sqlite-bridge.ts:139](../../apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts#L139) 和 [desktop-file-bridge.ts:166](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L166) 等待 host 返回后才登记 owner；Tauri 在 [router.rs:83](../../packages/rxdb-adapter-tauri/rust/src/router.rs#L83) 派发后才执行 `track()`。

若 `open` 已在 host 创建会话、但窗口先触发销毁回收，回收看到的是空归属表；请求恢复后才把 session 记到已销毁窗口名下。该 session 会一直持有数据库/文件 host 资源直到整个应用退出。

**修复**：两族 bridge 在登记前补一次 `target.isDestroyed()` 判定，已销毁则当场关掉会话并回 `session_closed`。判据落在共享的 [desktop-session-ownership.ts](../../apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts) 的 `denyDestroyedTarget()`，与 `denyForeignSession()` 同一个理由——抄两份，改一份就是另一份悄悄失效。未采纳原建议的 tombstone 表：`DesktopFileEventTarget` 本来就有 `isDestroyed()`，不需要额外记账结构。两族各一条回归用例。

**Tauri 侧待办**：Rust 的 `owner` 只是一个 window label，拿不到「是否已销毁」，需要另一套判据。单列 follow-up，不阻塞本轮。

### 5. P3（初判 P2）：窗口销毁触发的异步文件清理不在退出流程中等待 —— ⏭ follow-up

[desktop-file-bridge.ts:191](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L191) 对 `file.close` fire-and-forget，并立即删除 owner 记录；随后 [main.ts:199](../../apps/dev-rxdb-electron/src-electron/main.ts#L199) 调用 `closeAll()` 时，host 的 session 表可能已经为空，因此无法等待仍在进行的 fd 关闭和临时文件删除。这确实违反 `closeAll()` 的「必须等它落地」契约。

**降级理由**：进程正在退出，fd 无所谓；实际残留只有一个临时文件，而它在下次启动的清扫里就会消失。SQLite 侧不受影响——那一族的 `closeAll()` 是同步的，没有这个窗口。

**若要修**：bridge 跟踪所有 in-flight close Promise，`closeAll()` 一并等待。

### 6. P1（初判 P2）：Angular/React/Vue provider 都漏接同步工厂异常 —— ✅ 已修复

- [rxdb.provider.ts:56](../../packages/rxdb-angular/src/rxdb.provider.ts#L56)
- [rxdb-react.tsx:143](../../packages/rxdb-react/src/rxdb-react.tsx#L143)
- [rxdb-vue.ts:126](../../packages/rxdb-vue/src/rxdb-vue.ts#L126)

三处实现都先执行工厂、再进入 Promise 链，`(() => { throw error })` 因此不会进入 `failure` 槽位。Angular 直接中止 bootstrap，React/Vue 则从 effect/setup 逃逸。

**升级理由**：这是全篇唯一一条**同时**违反了自身书面契约（三端 TSDoc 都写明「创建失败由 `useRxDB()` 抛出、可选读取保持 loading/error」）和「三框架 API 对称」铁律的缺陷，且 Angular 侧的后果是白屏——比初判的 P2 重。原文「现有测试只覆盖异步 reject」核实为真：三个 `__tests__/` 里 grep 不到任何同步 throw 用例。

**修复**：三端统一把工厂求值挪进 `Promise.resolve().then(...)` 回调内部，同步 throw 于是变成一次 reject，与 Promise source 同路。Angular 侧保留了已就绪 source 的同步赋值路径——`inject(RxDB)` 首帧即可读这条语义不能因为接异常而丢掉。三端各补一条同名用例 `routes a synchronously thrown factory error to the same failure slot`。

### 7. P3（初判 P2）：React 异步 source 切换会短暂发布旧数据库 —— ⏭ follow-up

[rxdb-react.tsx:220](../../packages/rxdb-react/src/rxdb-react.tsx#L220) 返回 `ready ?? state.db`，但 state 没有绑定 source 身份。已解析的 source A 切换到 source B 时，新 render 的 `pending=true`，state 仍是 A；在旧 effect cleanup 前，Provider 会把 A 继续发布给子树。

**降级理由**：窗口是一次 render，cleanup 里的 `setState(UNRESOLVED)` 会立刻纠正；且它要求调用方**动态更换 source**，而 source 在实际用法里基本是稳定的。

**若要修**：把 source identity 与 `db/failure` 一起存入 state，返回值只消费当前 source 的 state。

## 已确认通过

- Angular / React / Vue 共同具备 `RxDBSource`、provider、`useRxDB`、`useRxDBOptional`；框架 API 对称性通过。
- Electron、SQLite core、Tauri adapter、Angular、React、Vue、client generator、DevTools extension 测试通过。
- Electron/Tauri 应用层测试、Tauri Rust 单测和 Tauri conformance 套件通过。

## 验证记录

初轮通过 Nx 聚焦测试累计 4029 条用例。`rxdb-client-generator` 首次运行因沙箱禁止绑定 `::1:5173` 报 `EPERM`，沙箱外复跑 308 条全绿；Nx 将该任务标为 flaky，属于运行环境限制，不是断言失败。未执行完整 `pnpm test-all`，也未执行三平台打包矩阵。

修复轮：7 条新增用例先各自复现红，修复后 `rxdb-adapter-electron` / `rxdb-angular` / `rxdb-react` / `rxdb-vue` / `dev-rxdb-electron` 五个项目 1650 条用例全绿（`--skip-nx-cache`），五项目 `lint`（`--max-warnings=0`）与 `typecheck` 均通过。三平台打包矩阵仍未执行。

## 非代码风险

- `main..local-db` 的 57 个提交中多数标题不可审：`123`×10、`123123`×10、`12312`×3、`qwe`×2。若不 squash，会污染 conventional release 的版本计算、changelog、git blame 和 bisect。**这是全篇性价比最高的一条**，成本低于任何一个代码修复。
- 旧包 `@aiao/rxdb-adapter-desktop` 的 registry `npm deprecate` 仍是人工待办；迁移文档已提交，但发布动作尚未收口。

## 解决记录

- [x] 修复 #1 锁回收顺序（含 Rust 同序佐证）
- [x] 修复 #2 `beginWrite` 异步边界的会话回收判定
- [x] 修复 #4 Electron 两族 bridge 的销毁后登记
- [x] 修复 #6 三端同步工厂异常
- [x] 为以上四条补回归测试（7 条，先红后绿）
- [ ] follow-up：#3 / #5 / #7 与 #4 的 Tauri 侧
- [ ] squash 57 个提交里不可审的标题
- [ ] 重新运行 Nx affected 门禁与三平台打包 smoke
- [ ] 开 PR 并在 `pr` 字段记录链接
- [ ] PR 合并后将 `status` 改为 `Resolved`
