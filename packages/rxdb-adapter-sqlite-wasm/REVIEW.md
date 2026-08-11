# `@aiao/rxdb-adapter-sqlite-wasm` 代码评审

## 结论

🟡 凑合。核心 SQL 执行、参数校验和初始化失败清理可靠；公开客户端的空实例断开和重复初始化生命周期仍不自洽。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：sqlite-wasm 客户端、加载器、执行器、测试和公开入口；28 个文件，约 1,710 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| SQLITE-WASM-001 | P2 | `src/SqliteClient.ts:82` | `disconnect()` 假设 `#sqlite`、`#db` 和 `#queue` 已初始化。直接在新建实例或初始化失败后调用会访问未赋值私有字段并抛出非领域错误；断开后 `#is_init` 仍为 true，后续 `init()` 直接返回而连接已关闭。 | 改成显式状态机或至少让未初始化/已断开断开幂等，断开后明确禁止或支持重建。补充这两条生命周期测试。 |

## 其余观察

- `cacheSizeKb` 与 `batchTimeout` 均有运行时整数范围校验；多语句执行和 bindings 错误会带 SQL 上下文抛出。
- init 失败会关闭已打开连接；事件在断开时取消 hook/计时器。
- 继承 `@aiao/rxdb-adapter-sqlite-core` 的事务隔离与 OPFS 降级问题，详见该包报告。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-adapter-sqlite-wasm`、`pnpm nx typecheck rxdb-adapter-sqlite-wasm`、`pnpm nx lint rxdb-adapter-sqlite-wasm`、`pnpm nx build rxdb-adapter-sqlite-wasm`。
