# `@aiao/rxdb-adapter-pglite` 代码评审

## 结论

🟢 通过。相同 SQL 与绑定参数的并发写入会逐次执行；变更事件处理失败会保留原始错误并发布到 `changeErrors$`，同表队列可继续处理后续事件。

## 修复状态（2026-07-15）

- PGLITE-001 已修复：通用 `query()` 不再传 dedupe id，队列仅负责串行执行。
- 新增相同 SQL/参数并发写入两次、最终计数为 2 的回归测试。
- PGLITE-002 已修复：非 shutdown 错误不再被日志吞掉，由 adapter 在队列边界发布到只读 `changeErrors$`；shutdown 错误仍静默结束。
- 错误流测试验证原始错误可订阅，且失败后同表下一事件仍会执行。
- `pnpm nx test rxdb-adapter-pglite --skipNxCache` 通过：103 个测试文件、742 个测试，类型错误 0。
- `lint`、`typecheck`、`build` 全部通过。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：PGlite 客户端、事务、SQL 生成、同步、加密接入、测试和公开入口；155 个文件，约 24,780 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID         | 级别 | 位置                                                            | 问题与影响                                                                                                                              | 建议                                                                    |
| ---------- | ---- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| PGLITE-001 | P0   | `src/RxDBAdapterPGlite.ts`、`src/__tests__/query-queue.spec.ts` | 已修复。`query()` 只把任务加入单并发队列，不再以 SQL/参数作为去重 id；相同并发 INSERT 会各执行一次。                                    | 保留回归测试，禁止在通用写查询入口恢复隐式去重。                        |
| PGLITE-002 | P1   | `src/handle_rxdb_change.ts`、`src/RxDBAdapterPGlite.ts`         | 已修复。处理器只吞掉可识别的 shutdown 错误，其他错误原样 reject；adapter 队列统一规范化并发布到 `changeErrors$`，随后继续消费同表事件。 | 消费方应订阅 `changeErrors$` 并把错误接入同步状态、告警或显式重试策略。 |

## 其余观察

- PGlite client 对初始化失败会清理 Promise，支持重新创建客户端。
- SQL 值参数普遍通过 `$n` bindings 传递，标识符生成集中在 DDL 模块。
- 加密字段接入复用 Keyring；其并发 unlock 问题见 `@aiao/rxdb-adapter-encrypted` 报告。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-adapter-pglite`、`pnpm nx typecheck rxdb-adapter-pglite`、`pnpm nx lint rxdb-adapter-pglite`、`pnpm nx build rxdb-adapter-pglite`。
- 并发相同写操作必须逐次执行；变更事件处理失败必须可被消费方检测，且不能阻断后续同表事件。
