# 真实 PostgreSQL 验证记录

本轮18条任务、BOM19条故事及US-030已全部关闭，证据见[最终验收](closure-map.md)。

## 执行方式

```bash
pnpm nx run rxdb-plugin-bom:test-pg
```

使用本机 `initdb` / `pg_ctl` 自动创建并清理临时 PostgreSQL，只监听独占 Unix socket。`RXDB_BOM_PG_BIN` 可指定二进制目录，不接收或访问外部数据库 URL。

## 已确认的功能红

主会话确认：真实 PostgreSQL 16.15 集群成功启动与清理，8/8 测试失败。首个业务错误为 `relation "bom_header" does not exist`，来自未经 schema 限定的导出 DDL；不是缺少服务或依赖造成的编译红。

## 修复与功能绿

导出 SQL 已改为明确的 `bom` schema 与实体 camelCase 物理列；通过 `item_revision` 解析头父物料；保留 Read Committed 检查与按类型/组织串行的事务锁；发生项 `flowDirection` 改为 consume 时也进入触发器。

主会话于 2026-10-18 执行同一目标，真实 PostgreSQL **8/8 通过**：原样部署、Read Committed 等锁重检、两类固定快照隔离级别拒绝、跨作用域 `40P01`、自环/方向更新及类型/组织隔离全部通过。临时集群成功启动并清理，US-509 AC#13 据此关闭。

后续Reach远端回归扩展至真实PostgreSQL12/12通过，覆盖拓扑UPDATE/DELETE串行与隔离边界，并确认导出DDL保留调用方事务，ROLLBACK撤销派生表和约束安装；证据为`/private/tmp/bom-reach-pg-12-green.log`，详见[024验证记录](../024-bom-reach/quickstart.md)。上述8例为首轮历史证据，不代表当前全部用例数。

## 最终完整验收

最终完整affected EXIT0：86项目、351任务、324本地缓存、12m14（`/private/tmp/bom-affected-final-serial.log`）。三端共享51/51、demo24/24通过；Angular203/203（5.8m）、React199/199（5.5m）、Vue182/182有效缓存。最终首屏/输入p95分别1206/15.6、1105.2/42.2、796.3/9.5ms，均满足1500/100ms原预算，三端tree/editor均468px。

PGlite真实summary/final已从有效本地缓存恢复：13任务、12缓存、791ms，日志`/private/tmp/bom-pglite-final-coverage-restored.log`。严格8包官方coverage逐包执行8次全部EXIT0，证据`/private/tmp/bom-final-coverage-eight-packages.log`；SQLite/PGlite两条趋势软提示保留、均达门槛，baseline未改。早期仅评估rxdb一包的日志不作为8包证据。

本轮18条任务全部关闭，spec011～024共256/256完成，19条BOM故事、US-522 AC#1与US-030均Done。失败/控制历史、正式审计与最终结果见[最终验收](../021-bom-closure/closure-map.md)。
