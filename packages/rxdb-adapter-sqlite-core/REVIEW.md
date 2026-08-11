# `@aiao/rxdb-adapter-sqlite-core` 代码评审

## 结论

🔴 不通过。事务锁是 adapter 全局状态，导致并发的独立 `query()` 混入当前事务；同时 OPFS 失败默认静默改用内存库，违反持久化承诺。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：SQLite 基类、oo1 客户端、事务、SQL/FTS、同步和共享测试；94 个文件，约 23,135 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| SQLITE-CORE-001 | P0 | `src/RxDBAdapterSqliteBase.ts:275` | 事务期间 `#transaction_lock` 为全局 true，任意并发调用的 `query()` 都绕过串行队列并直接 `#exec()`。第二个请求可能并不属于该事务，却被其 COMMIT/ROLLBACK 一并提交或回滚；源码注释 `:304` 已承认这个边界。 | 用事务上下文/客户端绑定区分嵌套与并发请求，禁止非事务调用绕过队列。增加两个交错异步事务/裸写的隔离测试。 |
| SQLITE-CORE-002 | P1 | `src/Oo1ClientBase.ts:27` | 当 `opfs: true` 打不开持久化数据库时，默认 `opfsFallback: 'memory'` 只发 warning，随后继续以 `:memory:` 工作。用户仍以为数据持久化，刷新/重启后数据全部丢失。 | 默认改为 `throw`；若保留内存模式，必须显式 opt-in 且在 API 中暴露实际 storage 模式，不能作为透明 fallback。 |
| SQLITE-CORE-003 | P1 | `src/handle_rxdb_change.ts:221` | SQLite update hook 的异步回读/事件构建错误只写 `console.error` 后结束。发生解密、查询或监听器错误时，调用方和同步层都看不到失败，导致 Local-first 缓存静默不一致。 | 提供可订阅错误通道和可控重试/重放；保留原始错误，不以日志替代状态。 |

## 其余观察

- SQL 值均用绑定参数，动态表/列标识符通过 `quote_sql_identifier` 处理。
- 事务路径在 rollback 后派发回滚事件，客户端初始化失败会断开并清理缓存。
- 未发现 `any`、TypeScript 抑制指令或 ESLint 忽略。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-adapter-sqlite-core`、`pnpm nx typecheck rxdb-adapter-sqlite-core`、`pnpm nx lint rxdb-adapter-sqlite-core`、`pnpm nx build rxdb-adapter-sqlite-core`。
- 无关请求绝不能进入另一个请求的 SQL transaction；请求 OPFS 持久化失败时必须显式失败。
