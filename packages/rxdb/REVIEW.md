# `@aiao/rxdb` 代码评审

## 结论

🔴 不通过。核心同步与初始化路径存在 3 个 P1：适配器创建失败不可恢复、异步插件安装失败被吞掉、远端状态查询失败被伪装为“无更新”。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`packages/rxdb` 下源码、公开入口、测试和 Nx 配置；223 个文件，约 67,982 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过
- 测试现状：106 个 spec/test 文件；核心行为测试充足，但以下失败恢复分支缺少契约测试

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| RXDB-001 | P1 | `src/RxDB.ts:317` | `getAdapter()` 在工厂 Promise settle 前就写入 `#adapter_map`，reject 时不删除。`connect()` 只清理 `#connect_promise_map`，因此后续重试仍取得同一个 rejected Promise，注释承诺的“允许后续重试”实际不成立。瞬时初始化失败会永久毒化该 RxDB 实例。 | 给适配器创建 Promise 增加 identity-safe rejection cleanup，同时清理 adapter/connect 两张表；增加“工厂首次失败、第二次成功”的回归测试。 |
| RXDB-002 | P1 | `src/RxDB.ts:252` | `init()` 是同步方法，而 `#install_plugin()` 对 Promise 只挂 `catch(console.error)`。插件仍在安装时 Schema/Entity/VersionManager 已继续初始化；安装失败也不会让 `connect()` 失败，且 `#rxdb_initialized` 已锁死，产生部分初始化实例。 | 让初始化链路返回并 await Promise；插件安装使用 `Promise.all` 传播错误；失败时回滚已安装插件并恢复可重试状态。 |
| RXDB-003 | P1 | `src/version/get-repository-sync-status.ts:145` | `calculatePullableCount()` 捕获所有远端错误后返回 `0`。网络、权限或协议错误会被报告成“没有可拉取更新”，监控和 UI 无法区分健康状态与查询失败，可能导致数据长期不同步。 | 删除 `0` fallback 并传播错误，或把状态建模为显式 `unknown/error`；不得复用合法计数值表达失败。补充远端计数失败测试。 |

## 其余观察

- 事务事件在 commit 后批量派发、rollback 时硬复位，嵌套事务语义清晰。
- `findOne()` 的运行时空值契约为 `null`，核心声明与实现一致；生成器中的偏差记录在其独立报告。
- 未发现 `any`、TypeScript 抑制指令或 ESLint 忽略。

## 验收条件

- 逐项补充失败恢复测试，执行 `pnpm nx test rxdb`、`pnpm nx typecheck rxdb`、`pnpm nx lint rxdb`、`pnpm nx build rxdb`。
- 任何初始化失败都必须向调用方传播，并允许同一实例在修复瞬时条件后重试。
