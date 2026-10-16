# Review：@aiao/rxdb 评审

## 结论

🟢 未发现足以定级为 P0-P2 的新问题。核心仓储、适配器生命周期、事务事件、插件调度和导出面均有针对性回归测试与生命周期注释。

## 检查范围

检查 `RxDB.ts`、`Repository.ts`/`QueryManager.ts`、`rxdb.transaction.ts`、插件调度器、实体权限/约束、同步契约、backup/capture/system 目录及其 `src/__tests__`；核对 `package.json`、`project.json` 的 build/typecheck/test inputs、exports 和 SKILL 生成目标。

## 发现

无。仓储分页入口先校验非负安全整数并保留 `limit: 0`（`src/repository/Repository.ts:59-73,305-324`）；QueryCache 会话懒创建且 destroy 清理失效监听与计时器（`src/repository/Repository.ts:90-106,220-227`）；连接纪元在 disconnect 时作废在飞 connect（`src/RxDB.ts:1493-1510`）；事务事件在提交/回滚时隔离批量监听器错误（`src/rxdb.transaction.ts:34-53,88-143`）。

## 风险/未覆盖

未覆盖真实 SQLite/PGlite 竞争、跨 tab 广播、崩溃恢复和大数据量性能；这些需适配器契约及真实宿主运行。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
