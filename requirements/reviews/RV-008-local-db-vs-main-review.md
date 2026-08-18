---
id: RV-008
title: local-db 相对 main 的全量代码复审
status: Open
created: 2026-08-18
updated: 2026-08-18
pr:
---

# Review：`local-db` vs `main`

**判定：🔴 不可合并。** 当前分支有明确的资源泄漏、生命周期竞态和跨框架 provider 异常处理缺陷。单测和一致性套件全绿不能覆盖这些时序窗口。

## 范围

| 项 | 值 |
| --- | --- |
| 分支 | `local-db` |
| 对比基线 | `main...HEAD` |
| merge-base | `91cb5a1` |
| 变更量 | 216 文件，+10356 / -1489 |
| 相对 `main` 提交数 | 57 |
| 工作区 | 干净 |
| 静态检查 | `git diff --check main...HEAD` 通过 |

## Findings

### 1. P1：Electron 锁会重新授予正在关闭的会话

[electron-file-host.ts:426](../../packages/rxdb-adapter-electron/src/electron-file-host.ts#L426)

`closeSession()` 先释放已持有锁，并在每把锁上调用 `pump()`；到 432 行才执行 `dropWaiters(sessionId)`。当同一会话既持有某文件锁、又排队申请同名锁时，`pump()` 会先把锁授予正在关闭的会话。会话随后从 `sessions` 删除，新的锁既不在旧快照中，也不再能被 `dropWaiters()` 回收，其他窗口会永久等待。

最小复现结果：`regranted=file.lockAcquire, trackedLocks=1, secondSession=blocked`。Rust 侧已经用相反顺序并覆盖了同类测试：[locks.rs:150](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/file/locks.rs#L150)。

**修复方向**：先拒绝/移除该会话的所有等待者，再释放持有锁并推进队列；补 Electron 同会话“持有 + 排队 + 关闭”测试。

### 2. P1：`file.writeBegin` 与关闭并发时泄漏 fd 和临时文件

[electron-file-host.ts:529](../../packages/rxdb-adapter-electron/src/electron-file-host.ts#L529)

`beginWrite()` 在多个 `await` 后才把 `FileHandle` 放入 `session.writes`。窗口销毁触发 `closeSession()` 时，会话已经从表中删除，并且只扫描当时已有的写入；异步的 `beginWrite()` 随后仍可把句柄写回这个脱离宿主的 session。之后 `closeAll()` 和 `file.writeAbort` 都找不到它。

实测并发 `writeBegin` / `file.close` 后，两个请求都成功、`openSessions=0`，但磁盘留下 `.rxdb-tmp`。重复该路径可以绕过每会话 pending-write 上限并持续耗尽宿主 fd。

**修复方向**：对 session 的操作串行化，或在每个异步边界检查关闭状态；关闭状态下必须关闭新句柄并删除临时文件。

### 3. P2：启动临时文件清扫可能删除当前进程正在写的文件

[desktop-file-bridge.ts:152](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L152) 启动递归后台清扫，但 [desktop-file-bridge.ts:159](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L159) 的请求路径不等待 `whenSwept`。递归清扫已有目录期间，新会话可以创建同后缀的临时文件，随后被清扫逻辑误删；Unix 上提交会遇到 `file_not_found`，Windows 上清扫可能因打开文件失败而提前终止。

**修复方向**：文件请求在清扫完成前排队；或者只清扫创建 bridge 时拍下的不可变文件快照。补“清扫进行中创建写入”的并发测试。

### 4. P2：Electron/Tauri 都有“窗口销毁后才登记会话”的竞态

Electron 在 [desktop-sqlite-bridge.ts:138](../../apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts#L138) 和 [desktop-file-bridge.ts:165](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L165) 等待 host 返回后才登记 owner；Tauri 在 [router.rs:88](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/router.rs#L88) 派发后才执行 `track()`。

若 `open` 已在 host 创建会话、但窗口先触发销毁回收，回收看到的是空归属表；请求恢复后才把 session 记到已销毁窗口名下。该 session 会一直持有数据库/文件 host 资源直到整个应用退出。

**修复方向**：把 open 与 owner 登记纳入同一生命周期临界区，或维护已销毁 owner 的 tombstone，禁止销毁后的 open 结果重新登记。

### 5. P2：窗口销毁触发的异步文件清理不在退出流程中等待

[desktop-file-bridge.ts:182](../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts#L182) 对 `file.close` fire-and-forget，并立即删除 owner 记录；随后 [main.ts:199](../../apps/dev-rxdb-electron/src-electron/main.ts#L199) 调用 `closeAll()` 时，host 的 session 表可能已经为空，因此无法等待仍在进行的 fd 关闭和临时文件删除。应用可在清理完成前退出，违反 `closeAll()` 的“必须等它落地”契约。

**修复方向**：bridge 跟踪所有 in-flight close Promise，`closeAll()` 同时等待这些 Promise 和 session 表中的会话。

### 6. P2：Angular/React/Vue provider 都漏接同步工厂异常

三处实现都会先执行工厂，再进入 Promise 链：

- [rxdb.provider.ts:58](../../packages/rxdb-angular/src/rxdb.provider.ts#L58)
- [rxdb-react.tsx:154](../../packages/rxdb-react/src/rxdb-react.tsx#L154)
- [rxdb-vue.ts:124](../../packages/rxdb-vue/src/rxdb-vue.ts#L124)

`(() => { throw error })` 不会进入 `failure` 槽位。Angular 可能直接中止 bootstrap，React/Vue 则从 effect/setup 逃逸；这与三端文档宣称的“创建失败由 `useRxDB` 抛出、可选读取保持 loading/error”不一致。现有测试只覆盖异步 reject。

**修复方向**：用 `Promise.resolve().then(() => factory())` 接管同步 throw，并为三端补同一组同步异常测试。

### 7. P2：React 异步 source 切换会短暂发布旧数据库

[rxdb-react.tsx:217](../../packages/rxdb-react/src/rxdb-react.tsx#L217) 返回 `ready ?? state.db`，但 state 没有绑定 source 身份。已解析的 source A 切换到 source B 时，新 render 的 `pending=true`，state 仍是 A；在旧 effect cleanup 前，Provider 会把 A 继续发布给子树。子组件可能以 B 的配置对 A 执行 effect 或写入。

**修复方向**：把 source identity 与 `db/failure` 一起存入 state，返回值只消费当前 source 的 state；补 A→B、A→失败和失败→B 的切换测试。

## 已确认通过

- Angular / React / Vue 共同具备 `RxDBSource`、provider、`useRxDB`、`useRxDBOptional`；框架 API 对称性通过。
- Electron、SQLite core、Tauri adapter、Angular、React、Vue、client generator、DevTools extension 测试通过。
- Electron/Tauri 应用层测试、Tauri Rust 单测和 Tauri conformance 套件通过。

## 验证记录

本轮通过 Nx 聚焦测试累计 4029 条用例。`rxdb-client-generator` 首次运行因沙箱禁止绑定 `::1:5173` 报 `EPERM`，沙箱外复跑 308 条全绿；Nx 将该任务标为 flaky，属于运行环境限制，不是断言失败。未执行完整 `pnpm test-all`，也未执行三平台打包矩阵。

## 非代码风险

- `main..HEAD` 的 57 个提交中多数标题是 `123` / `qwe` 等不可审内容；若不 squash，会污染 conventional release 的版本计算、changelog、git blame 和 bisect。
- 旧包 `@aiao/rxdb-adapter-desktop` 的 registry `npm deprecate` 仍是人工待办；迁移文档已提交，但发布动作尚未收口。

## 解决记录

- [ ] 修复 P1/P2 findings
- [ ] 为每个并发窗口补回归测试
- [ ] 重新运行 Nx affected 门禁与三平台打包 smoke
- [ ] 开 PR 并在 `pr` 字段记录链接
- [ ] PR 合并后将 `status` 改为 `Resolved`
