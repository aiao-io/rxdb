# rxdb-adapter-sqlite 深度评审

评审日期：2026-10-29；源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。更新轮核对：自基线 `7bb16a9` 至 HEAD 本包无源码变更。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：本包的薄封装未发现新增确定缺陷；继承共享 SQLite 加密写入失败问题（P2）。官方 sqlite-wasm 的加载与存储配置被限制在入口层，主要数据库逻辑由 core 负责。2026-10-29 更新轮未发现新的确定问题。

| 评审重点           | 证据入口                                                                                                                                                                       | 当前判断                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| adapter 配置与库名 | [`RxDBAdapterSqlite.createClient` / `backupStorage` / `dropStorage`](../../../packages/rxdb-adapter-sqlite/src/RxDBAdapterSqliteOfficial.ts)                                   | RxDB dbName 贯穿客户端、OPFS 文件名和持久化备份标识                           |
| 模块加载与配置隔离 | [`sqliteLoad` / `resetSqliteLoadCache`](../../../packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts)                                                               | 按加载指纹检查缓存，初始化经全局加载锁，临时 Worker/config patch 由共享层管理 |
| 连接与 transport   | [`SqliteClient`](../../../packages/rxdb-adapter-sqlite/src/SqliteOfficialClient.ts)、[`createSqliteClient`](../../../packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts) | Oo1ClientBase 复用生命周期；Worker 代理有独立子端口租用                       |

## 问题清单与共享风险

新增独立确定缺陷：0。继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体归一化后的加密物理列以 `Id` 结尾时跳过加密，正常公开仓库在解密回填时失败并回滚；未证普通保存后提交明文。修 core 后需要本包的真实 SQLite 加密 CRUD 与落盘字节验证，不能只跑 Keyring 单元测试。

**2026-10-29 复核：**本包无源码变更，`RxDBAdapterSqlite.createClient/backupStorage/dropStorage`、`sqliteLoad/resetSqliteLoadCache`、`SqliteOfficialClient` 与 `createSqliteClient` 均在；继承链（本包 → sqlite-core 的转换与事务包装）复核结论以 sqlite-core 报告为准，仍有效。本更新轮未发现新的确定问题。

## 已有契约与风险边界

OPFS 的 `memory` fallback 与恢复组合被明确拒绝，因为持久目标不确定；这不是本次缺陷。调用方持有的 Worker 默认不被 terminate，直接使用 createSqliteClient 需要断开后 releaseComlinkProxy，README 已公开说明。dropStorage 删除库文件与 journal/wal/shm，仍需要浏览器验证异步句柄释放。

## 测试与后续计划

已定位 [`sqlite-official-load.utils.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/sqlite-official-load.utils.spec.ts)、[`SqliteOfficialClient.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/SqliteOfficialClient.spec.ts)、[`encrypted-bigint-binary.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/encrypted-bigint-binary.spec.ts) 和 backup/drop-storage 入口。未独立重跑真实 OPFS、Worker 重连、浏览器崩溃恢复与全部 conformance；本报告不据此宣称生产环境零风险。

## 调用链交叉核查

官方 oo1 transport 的 [`wrapWithComlinkEndpoint`](../../../packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts) 明确要求同一底层 Worker 客户端单活；该共用入口同时处理 SharedWorker。不同 realm 的对象不会共享 WeakMap，接入方仍必须遵守单活约定，不能从 sharedWorker 选项推导出多标签页并用支持。违反该约定后错关共有连接的局部诊断不登记为新缺陷。

## 本次 Nx 校验

首轮（2026-10-28）`rxdb-adapter-sqlite:test`：834 passed | 13 skipped (847)；目标实际执行。命令及整体边界见[总索引](README.md)。
