# rxdb-adapter-sqliteai 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：本包自身未发现新增确定缺陷；继承共享 SQLite 加密问题。sqliteai 与官方 oo1 后端共用生命周期，但其内置扩展初始表必须采用独立恢复验收。

| 评审重点           | 源码与符号                                                                                                                                                                     | 当前判断                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| adapter 路径与能力 | [`RxDBAdapterSqliteai`](../../../packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts)                                                                                    | 以 RxDB 库名创建客户端；backupStorage 拒绝不确定的 OPFS memory fallback；drop 文件集合与官方路径对齐 |
| 加载与缓存         | [`sqliteaiLoad`](../../../packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts)                                                                                           | 加载配置按 fingerprint 与全局 oo1 加载锁隔离，不只缓存“是否打过 patch”                               |
| 客户端与 transport | [`SqliteaiClient`](../../../packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts)、[`createSqliteClient`](../../../packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts) | 只覆盖 clientName/loadModule，Oo1ClientBase 负责初始化、队列与事件；Worker 接入走共享端口层          |

## 问题清单与共享风险

新增独立确定缺陷：0。继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体的加密 `*Id` 列明文写出。sqliteai 扩展不会替这段 renderer 数据归一化补加密，不应在扩展层另加特判。

## 已知约束与验证边界

[README](../../../packages/rxdb-adapter-sqliteai/README.md) 明确把 `_sqliteai_vector`、`dbmem_*` 和 FTS5 影子表及初始行视为“新建空库”的基线；恢复目标不能以“存在任意表”误判非空。Worker 所有权、直接 createSqliteClient 的释放规则与官方包同口径；未把 documented unsupported 的 fallback 恢复组合记为缺陷。

## 测试与后续计划

已定位 [`sqliteai-load.utils.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/sqliteai-load.utils.spec.ts)、[`SqliteaiClient.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/SqliteaiClient.spec.ts)、[`sqliteai-backup.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/backup/sqliteai-backup.spec.ts)、加密与 worktree conformance。后续优先跑共享加密回归，再在真实扩展库验证备份恢复字节一致。此次未独立执行浏览器 OPFS 和扩展升级兼容验证。

## 本次 Nx 校验

本次 `rxdb-adapter-sqliteai:test`：843 passed | 10 skipped (853)；目标实际执行。命令及整体边界见[总索引](README.md)。
