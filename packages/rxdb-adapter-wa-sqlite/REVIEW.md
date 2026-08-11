# `@aiao/rxdb-adapter-wa-sqlite` 代码评审

> [!WARNING]
> **本文档已失效，不要按它做判断。**
>
> 基线是 `03a46a5d5992a958c19ae33d5fed15c9c3322021`（2026-07-14），其后代码已大幅变动：
> 结论、问题表与「修复状态」章节均未随之更新，照它排期会重复处理已修项、漏掉新增项。
>
> 当前有效的评审见 [`code-reviews/packages/rxdb-adapter-wa-sqlite.md`](/code-reviews/packages/rxdb-adapter-wa-sqlite.md)；
> 未收口条目的逐条判定见 [`code-reviews/incomplete/`](/code-reviews/incomplete/) 下对应编号的文件
> （每个文件顶部的 `## 判定：` 块给出对照**当前源码**的结论与证据）。

## 结论

🔴 不通过。性能选项的运行时校验已与 sqlite-wasm 对齐，但该包仍继承 SQLite core 的事务隔离 P0。

## 修复状态（2026-07-15）

- WA-SQLITE-001 已修复：`cacheSizeKb` 使用正整数校验，`batchTimeout` 使用允许 0 的非负整数校验，校验逻辑复用 sqlite-core。
- 回归测试覆盖负数、0、NaN、小数和恶意字符串；`pnpm nx test rxdb-adapter-wa-sqlite --run src/__tests__/create_sqlite_client.spec.ts --skipNxCache` 通过 16 个测试。
- WA-SQLITE-002 未修复：等待 sqlite-core 事务上下文隔离修复和本运行时集成回归测试。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：wa-sqlite 客户端、加载器、Worker/SharedWorker 传输、测试和公开入口；30 个文件，约 1,587 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID            | 级别       | 位置                                                                                               | 问题与影响                                                                                                                         | 建议                                                                         |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| WA-SQLITE-001 | P1         | `src/SqliteClient.ts`、`src/create_sqlite_client.ts`、`src/__tests__/create_sqlite_client.spec.ts` | 已修复。配置在工厂和 client 初始化边界都经 `validateSqliteNumericOption` 校验，非法值无法进入 `PRAGMA cache_size` 或批处理定时器。 | 保留与 sqlite-wasm 对称的边界测试和共享校验器。                              |
| WA-SQLITE-002 | P0（继承） | `@aiao/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:275`                                  | 本适配器直接继承全局事务锁实现，因此会让无关并发 query 混入当前事务。                                                              | 先修复 sqlite-core；本包增加端到端事务隔离回归测试，防止具体运行时绕过修复。 |

## 其余观察

- Worker/SharedWorker 配置互斥且校验完整，生命周期状态机比 sqlite-wasm 明确。
- 事件批处理、断开等待与自定义 regexp 函数路径清晰。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-adapter-wa-sqlite`、`pnpm nx typecheck rxdb-adapter-wa-sqlite`、`pnpm nx lint rxdb-adapter-wa-sqlite`、`pnpm nx build rxdb-adapter-wa-sqlite`。
