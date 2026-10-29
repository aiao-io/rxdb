# rxdb-adapter-sqlite-wasm 深度评审

评审日期：2026-10-29；源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。本报告按风险追踪公开入口与关键调用链，未声称逐行覆盖全部源码。更新轮核对：自基线 `7bb16a9` 至 HEAD 本包无源码变更。

验证口径：区分源码实证、原函数局部执行与真实后端运行。统一 Nx 校验结果见 [包级索引](README.md)；未运行的浏览器、真机或 Rust 宿主测试不计为通过。

## 结论与范围

🟡凑合：VFS、OPFS 重试和 Worker 生命周期已有专门约束；但 transport 推断与共享连接治理没有使用同一判据。独立问题 1 条，另继承 sqlite-core 的 P2 加密写入缺陷。2026-10-29 更新轮复核 SWM-001 仍有效，未发现新的确定问题。

| 评审重点                   | 证据入口                                                                                                                                                                                                        | 当前判断                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Worker / SharedWorker 选择 | [`createSqliteClient`](../../../packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts)、[`RxDBAdapterSqlite.sharedClientLockName`](../../../packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts) | 发现 SWM-001                                         |
| 并发初始化与关闭           | [`SqliteClient.init` / `release` / `disconnect`](../../../packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts)                                                                                                | 有共享初始化 promise、owner 集合和并发关闭 promise   |
| VFS 与打开失败             | [`checkVFSConfig` / `sqliteLoad` / `openOpfsOnce`](../../../packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts)                                                                                         | 按实际 runtime 校验，OPFS 重试前释放失败句柄         |
| SQL 句柄回收               | [`executeHelper` / `runBoundStatement`](../../../packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts)                                                                                                       | 绑定多语句拒绝；逐个 finalize，原始错误优先          |
| 存储回收与恢复             | [`RxDBAdapterSqlite.#storageDrop` / `backupStorage`](../../../packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts)                                                                                       | 核对 idb、idb-memory、OPFS 路径与 transport 拒绝规则 |

## 确定问题

### SWM-001 · P1 · 仅传 sharedWorkerInstance 时没有共享事务锁，断开会关闭其他标签页

**2026-10-29 复核：**仍有效。HEAD `f62f77c19d55c73d8335df026778422282c2fed4` 相对基线本包无源码变更：`validateComlinkTransportOptions` 仍是单向校验（flag 缺实例报错，只传 `sharedWorkerInstance` 不报错）；`wrapWithComlinkEndpoint` 仍按实例 wrap 端口；`sharedClientLockName` 仍仅按 `options.sharedWorker === true` 返回锁名，实例推断与 adapter 锁判据不一致的整条链不变。双标签真实浏览器复现仍未补。

**证据与根因。** [`createSqliteClient`](../../../packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts) 把实例交给 [`wrapWithComlinkEndpoint`](../../../packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts)，后者接受 `sharedWorker` 未指定、只有 `sharedWorkerInstance` 的组合，并实际 wrap 其端口；`checkVFSConfig` 对支持 SharedWorker 的 memory/idb 也允许这条路径。但是 adapter 的判据是：

```ts
return this.options.sharedWorker === true ? `rxdb-sqlite-shared-client:${ADAPTER_NAME}:${this.#dbName}` : undefined;
```

[`RxDBAdapterSqliteBase.#withSharedClientLock` / `#closeClient`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 只根据这个返回值选择跨标签 Web Lock 和 `release(owner)`；返回 `undefined` 时直接执行任务、直接 `client.disconnect()`。

**触发步骤。** 两个标签页以相同 worker 名连到同一 SharedWorker，各自传 `{ vfs: 'idb', sharedWorkerInstance }` 而省略 `sharedWorker: true`。依次连接成功后并发开启事务，或关闭其中一个标签页的 adapter。预期事务跨标签排队，关闭只交还当前 owner；实际不会取得该锁，第二端 BEGIN 可能直接失败，关闭一端则会断掉双方的客户端。

**影响。** 并发事务不能按共享连接合同排队；一端断连直接关闭共有连接，使另一端后续读写失败并中断活动事务。没有证据证明普通并发事务会把第二端写入混入第一端并跟随其回滚。`wa-sqlite` 在客户端构造时强制 flag/instance 成对，因此不重复登记到那个包。

**验证。** 源码调用链实证，并通过 Node `stripTypeScriptTypes` 提取当前 `sharedClientLockName` 原方法执行：同一个实例参数下，仅传实例返回 `null`（未启用锁），显式 flag 返回 `rxdb-sqlite-shared-client:sqlite-wasm:shared-review`。尚未运行省略 flag 的双标签真实浏览器复现。现有 [`shared-client.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/shared-client.spec.ts) 的 `openTab` 始终显式传 `sharedWorker: true`；[`create_sqlite_client.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/create_sqlite_client.spec.ts) 也未覆盖该实例推断与 adapter 锁的交集。

**修复与回归。** 在单一 transport 解析入口归一化 flag/instance，锁名、owner 释放、传给远端的加载选项都使用该结果。复用现有双标签套件分别覆盖“只有实例”与“flag + 实例”，验证事务原子性、关闭 A 后 B 可写、最后一端关闭后可重连。

## 共享风险

继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体的加密 `*Id` 列跳过加密转换，正常公开写入在解密回填时失败并回滚。本包不要另加补丁，修共享内核并运行本后端加密套件。

## 已文档化限制与验证边界

`fs-handle` 不支持 dropStorage；备份/恢复只交付主线程 memory/idb，worker/sharedWorker 组合明确报 unsupported。它们不计为新增缺陷。OPFS 真占用、多标签、浏览器崩溃后恢复仍需浏览器目标验证；普通 `test` 不能替代这些结果。

## 调用链交叉核查

再次核对 sharedWorker 未指定但实例存在：Comlink transport 校验允许，实际 SharedWorker 上 memory/idb 的 VFS 校验也允许；`backupStorage` 因实例存在拒绝备份，但这不阻断正常连接。SWM-001 的公开触发链保留，普通并发事务的影响仅写作 BEGIN 失败/缺失排队及断开破坏他端。

## 本次 Nx 校验

首轮（2026-10-28）`rxdb-adapter-sqlite-wasm:test`：994 passed | 13 skipped (1007)；目标实际执行。命令及整体边界见[总索引](README.md)。
