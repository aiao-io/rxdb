# rxdb-adapter-wa-sqlite 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：本包重点路径未发现新增确定缺陷；继承共享 SQLite 加密写入失败问题（P2）。VFS 分级与 transport 成对校验较清晰，不能把实验性 VFS 与默认 IDB 后端混作同一成熟度。

| 评审重点             | 源码与符号                                                                                                                                                                                                                  | 当前判断                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| transport 与参数     | [`createSqliteClient` / `validateTransport`](../../../packages/rxdb-adapter-wa-sqlite/src/create_sqlite_client.ts)                                                                                                          | flag/instance 成对，Worker 与 SharedWorker 互斥；函数型 load 选项跨线程前拒绝   |
| 客户端 runtime 配置  | [`resolveBrowserOptions` / `WaSqliteClient`](../../../packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts)                                                                                                                  | 配置 identity 包含 dbName、VFS、构建模式与加载函数，库名有 UTF-8 路径预算       |
| VFS 加载与 OPFS 重试 | [`checkVFSConfig` / `waSqliteLoad` / `openWaSqliteDatabase`](../../../packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts)                                                                                             | 冻结能力表；sync/async glue 与 WASM 文件名不匹配早失败；CoopSync 重试前释放句柄 |
| 存储删除             | [`RxDBAdapterWaSqlite.#storageDrop` / `sharedClientLockName`](../../../packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts)、[`deleteIdbVfsFiles`](../../../packages/rxdb-adapter-wa-sqlite/src/drop-storage.utils.ts) | 只按当前库路径删除共用 IDB 中记录；SharedWorker 显式启用共享锁与 owner 释放     |

## 问题清单与共享风险

新增独立确定缺陷：0。继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体的加密 `*Id` 列跳过加密转换，正常公开写入在解密回填时失败并回滚。sqlite-wasm 的“只有 sharedWorkerInstance”问题不重复登记到本包，因为 `validateTransport` 在 wrap 前拒绝这个组合。

## 当前契约

默认 `IDBBatchAtomicVFS` 生产支持；其它 VFS 的实验/测试等级、运行环境与多连接约束见 [README](../../../packages/rxdb-adapter-wa-sqlite/README.md)。AccessHandlePoolVFS 不支持 dropStorage，备份/恢复只支持主线程 Memory/IDBBatchAtomic；这些限制已经明示，不记新增缺陷。wa-sqlite 上游 commit 与归档 integrity 由仓库独立供应链审计负责，本次未变更依赖。

## 测试与后续计划

已定位 create_sqlite_client、drop-storage、encrypted-crud/lifecycle/tamper、OPFS reload 和 shared-client 相关测试入口。优先补共享内核的加密列后缀真实落盘回归，再运行默认 IDB 及双标签 SharedWorker 事务套件；实验性 VFS 单独验收。此次未重跑所有浏览器 VFS、持久化与崩溃恢复组合，也未重新测量 coverage。

## 调用链交叉核查

`validateTransport` 在 wrap 前要求 flag/instance 成对；`sharedClientLockName` 因而与实际 SharedWorker transport 一致。共享 owner release 和 orphan rollback 的存在，不能代替真双标签验证，但足以反证把 SWM-001 同形配置直接套到本包。

## 本次 Nx 校验

本次 `rxdb-adapter-wa-sqlite:test`：1007 passed | 14 skipped (1021)；目标实际执行。命令及整体边界见[总索引](README.md)。
