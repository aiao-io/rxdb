# 计划：真实 PostgreSQL 环约束

先由真实数据库执行导出 SQL 的测试暴露部署问题，再修 schema、物理列、父物料解析与 mutation 入口；保留公开函数签名。并发测试用 `pg_locks` 的未授予 advisory lock 作为同步点，不用固定 sleep 推测事务正在等待。

测试目录使用 `packages/rxdb-plugin-bom/tests-pg/`，避开现有浏览器套件 `{src,tests}` 的扫描；独立 Node 配置 `vitest.pg.config.mts` 直接导入目标纯函数，不重建共享 dist。根工作区已有 `pg`、`@types/pg`，不新增生产依赖。

主会话在包的 `project.json` 增加目标，根配置不变：

```json
"test-pg": {
  "executor": "nx:run-commands",
  "cache": false,
  "options": {
    "cwd": "packages/rxdb-plugin-bom",
    "command": "vitest run --config vitest.pg.config.mts"
  }
}
```

运行入口为 `pnpm nx run rxdb-plugin-bom:test-pg`。需要显式核对这些新 Node 测试的 strict/lint，包 `tsconfig.spec.json` 的 `include` 应补 `vitest.pg.config.mts`、`tests-pg/**/*.ts`；由主会话统一接入，避免并发改配置。

PostgreSQL 程序默认从 PATH 查找 `initdb`、`pg_ctl`。初始化与停止都只指向本测试的随机临时目录；关闭 TCP，独立 socket 允许多个 checkout 复用相同 PG 端口号而不抢占服务。可用 `RXDB_BOM_PG_BIN` 指定上述二进制所在目录，不接收外部数据库 URL。
