# rxdb-adapter-sqliteai 深度评审

评审日期：2026-10-29；源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。更新轮核对：自基线 `7bb16a9` 至 HEAD 本包无源码变更。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：本包自身未发现新增确定缺陷；继承共享 SQLite 加密写入失败问题（P2）。sqliteai 与官方 oo1 后端共用生命周期，但其内置扩展初始表必须采用独立恢复验收。2026-10-29 更新轮未发现新的确定问题。

| 评审重点           | 源码与符号                                                                                                                                                                     | 当前判断                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| adapter 路径与能力 | [`RxDBAdapterSqliteai`](../../../packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts)                                                                                    | 以 RxDB 库名创建客户端；backupStorage 拒绝不确定的 OPFS memory fallback；drop 文件集合与官方路径对齐 |
| 加载与缓存         | [`sqliteaiLoad`](../../../packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts)                                                                                           | 加载配置按 fingerprint 与全局 oo1 加载锁隔离，不只缓存“是否打过 patch”                               |
| 客户端与 transport | [`SqliteaiClient`](../../../packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts)、[`createSqliteClient`](../../../packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts) | 只覆盖 clientName/loadModule，Oo1ClientBase 负责初始化、队列与事件；Worker 接入走共享端口层          |

## 问题清单与共享风险

新增独立确定缺陷：0。继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体的加密 `*Id` 列跳过加密转换，正常公开写入在解密回填时失败并回滚。sqliteai 扩展不会替这段 renderer 数据归一化补加密，不应在扩展层另加特判。

**2026-10-29 复核：**本包无源码变更，`RxDBAdapterSqliteai`、`sqliteaiLoad`、`SqliteaiClient` 与 `createSqliteClient` 均在；backupStorage 对 OPFS `memory` fallback 的拒绝与 README 关于 `_sqliteai_vector`/`dbmem_*` 初始表的说明不变；继承链复核结论以 sqlite-core 报告为准，仍有效。本更新轮未发现新的确定问题。

## 已知约束与验证边界

[README](../../../packages/rxdb-adapter-sqliteai/README.md) 明确把 `_sqliteai_vector`、`dbmem_*` 和 FTS5 影子表及初始行视为“新建空库”的基线；恢复目标不能以“存在任意表”误判非空。Worker 所有权、直接 createSqliteClient 的释放规则与官方包同口径；未把 documented unsupported 的 fallback 恢复组合记为缺陷。

## 测试与后续计划

已定位 [`sqliteai-load.utils.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/sqliteai-load.utils.spec.ts)、[`SqliteaiClient.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/SqliteaiClient.spec.ts)、[`sqliteai-backup.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/backup/sqliteai-backup.spec.ts)、加密与 worktree conformance。后续优先跑共享加密回归，再在真实扩展库验证备份恢复字节一致。此次未独立执行浏览器 OPFS 和扩展升级兼容验证。

## 调用链交叉核查

与官方 oo1 后端一样，Worker/SharedWorker 接入服从 [`wrapWithComlinkEndpoint`](../../../packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts) 的同一底层客户端单活约定；Oo1ClientBase 没有 wa-sqlite/sqlite-wasm 的多 owner 共享合同。未将超出此约定的并发接入计为产品 P1。加载配置指纹仍经全局 oo1 锁串行。

## 本次 Nx 校验

首轮（2026-10-28）`rxdb-adapter-sqliteai:test`：843 passed | 10 skipped (853)；目标实际执行。命令及整体边界见[总索引](README.md)。
