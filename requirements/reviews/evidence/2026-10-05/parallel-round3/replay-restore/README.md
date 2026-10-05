# R3-06：Replay core 真实 PGlite restore 归属结算

2026-10-05。**源码审阅与归属意见已交付；不因完整 C4 / 发布门禁尚未完成而记作“评审没做”。停止继续执行，不扩多后端、录制→回放 UI 或 resume 矩阵。**

## 判别

1. 保存旧源码后，以同一 SHA 的旧 probe 锁内 fresh 复现 **1 pass / 1 fail**，仍是 `changed != first`。历史 final-stable 指纹也等于 `ad5d98db3470bc5790e8d932f00a4b217b8862500a7953305547aff4798d1557`。最终那条红并非无参数 disconnect 或嵌套事务超时；那些是更早批次另有日志的夹具误用。
2. 同一真实 PGlite memory 库：创建/提交 first、创建/提交 second、更新/提交 changed，确认 clean；目标 commit 自己的单元为 `operation=insert, patch.title=first`。Replay restore 成功后，**完整业务内容（namespace/entity/id/operation/patch/inversePatch/origin）与历史目标单元逐字段相等**地出现在公开 diff；新 unitId、空 transactionId、active session、dirty/restoring=true 都实测成立。
3. raw SQL 与 adapter repository 仍读到 changed。fresh discard 后，直接 `workingTree.restore` 对同一目标得到同样的 diff 与相同投影观测。不存在 Replay 包装层丢失 first 内容或改错目标的证据。
4. 原 probe 用业务 repository 的 title 断言“恢复出的工作树内容”，**混了观测层**。当前 Replay 契约是现取凭据后委托 WorkingTree、原样透传结果；此断言不能登记为 Replay core 产品故障。修订 probe 没有只把 first 改成 changed 混绿：新增历史内容→diff 精确等值、fresh CAS 位、状态、会话、历史不变、直接门面对照、dirty 拒绝零变化及 discard 退场断言。
5. **不能由 A/B 一致或 not-checkout 推导“业务投影本来就永远不该变”。** WorkingTree README 的查询可见泛化描述与 restore 的业务投影物化责任，本轮缺完整书面定义，保留 **pending**。若将旧 title 断言提升为这种更强契约，责任在 WorkingTree 专题；不把这组绿对照冒充已证明所有产品语义正确，也不再扩大本任务来补它。新增确认产品问题 / RV 编号均为 0。

## 最小有效调用序列与退场

`use workingTree/replay → connect('pglite') → enable → 普通 note.save（事务外） → status → commit(fresh credentials) → clean → replay.restoreToCommit(target)`。

成功后先读 `workingTree.diff/status/restoreSession`，不要把 adapter repository 当作 diff。再次 restore 以 dirty 返回拒绝且状态/内容不变；`status → discard(fresh credentials)` 清空条目与会话。随后 `status → workingTree.restore(target, fresh credentials)` 是同库直接正向对照，再 discard；最终 `clean=true, entryCount=0, restoring=false, conflicted=false`，afterEach `destroy()` 完成释放。

反向对照：clean 库上的不可达目标返回 unreachable_target，数据与 status 不变；`disconnectAll()` 后公开 Replay 门面抛 not_installed。没有嵌套外层 adapter.transaction 包住公开门面，也没有把 `disconnect()` 当无参数全断开。

## 代码契约锚点

| 层 | 锚点 | 意义 |
| --- | --- | --- |
| Replay 委托 | [restore.ts:41–56](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/restore.ts)；[manager.ts:187–189](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/manager.ts) | 先 status、捕获 branch/activation/head/workingTree revisions，再 restore；不自行 checkout、merge 或改写结果。 |
| Replay 纪元 | [plugin.ts:47–68、90](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/plugin.ts)；[RxDB.ts:1210、1249](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb/src/RxDB.ts) | runtime 释放后 #require 拒绝；disconnect 收 adapterName，disconnectAll 无参数全断开。 |
| 工作树目标与落盘 | [restore-command.ts:232–253、327–355、396–433](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts) | 读目标自己的 ChangeSet，编码成 WorkingTreeEntry；CAS 后保存条目和会话；dirty / unreachable 返回拒绝；没有业务实体物化写调用。 |
| 公开工作树读取 | [working-tree-facade.ts:278–300、382–415](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts)；[diff.ts:57–100](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts)；[status.ts:196–235](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/status.ts) | commitChanges 与 diff 承担历史内容/未提交内容观测；clean 来自 entryCount，restoring/conflicted 来自会话 revision 完整性。 |
| 记录/事务宿主 | [capture-interceptor.ts:44–59](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb/src/capture/capture-interceptor.ts)；[capture-hook.ts:123–137、371–392、408–432](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts)；[RxDBAdapterPGlite.ts:591–620](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts)；[PGliteTransactionExecutor.ts:45–53、139–146](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/transaction/PGliteTransactionExecutor.ts) | 真 adapter 排队新开事务；executor adapter 门面复用当前事务。旧嵌套排队不是合法最小序列。 |
| 原有真实套件 / 文档边界 | [commit.suite.ts:509–524、1630–1658](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/testing/commit.suite.ts)；[README.md:8–23](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/README.md) | 原共享恢复契约验证条目、会话、HEAD/历史；not-checkout 与“参与查询”的泛化描述不能替代业务投影责任的独立裁定。 |

## 输入指纹与有效执行

- 旧 probe SHA256：`ad5d98db3470bc5790e8d932f00a4b217b8862500a7953305547aff4798d1557`；旧 Git blob：`e9c19b6f55af6f5d21e67104161d781d4623d084`。[旧源码快照](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/original-review-parallel-restore.spec.ts.snapshot) 已保存。
- 当前 probe SHA256：`a7fc95c42a69876ffafeacb0958d1790d120cd026b8212a236e0f86561113b22`。最后仅把 UUID 返回类型从 string 收窄到 `ConformanceNote['id']`，独立 strict noEmit 通过；与两次真实绿对照的最后运行版本具有完全一致的 emitted JS（[类型擦除对照](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/type-only-runtime-proof.json)），不是用 transpile 冒充类型检查。
- 每次共享锁记录 582 个指定 scope 输入，6 次测量内 HEAD 和输入均稳定。首轮到最终 strict 的 scope 差异仅本评审 probe；19 项契约/输入指纹在 [完整账本](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/execution-ledger.json)。
- 共享工作区 HEAD 从 `76a3848e2086f4617b80f7b1a1b896ef76e5719c` 外部推进到 `72d3bde0303f819b2c88e7fe18130fa231806f1b`，不是本线程执行 Git 操作；不能声称全局 index 未变。本线程没有暂存、提交、回滚 index 或改变别人暂存项。
- 旧四份红日志 SHA256 全部原样保留；新的基线红、strict 类型红各有独占时间戳日志，不覆盖、不 skip。

| 独占执行名 | 实际结局 | probe SHA 前缀 | 日志 |
| --- | --- | --- | --- |
| `r3-06-baseline-20261005-01` | 1 pass / 1 fail / 0 skip | `ad5d98db3470` | [原始日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/r3-06-baseline-20261005-01/20261005T152415659560.txt) |
| `r3-06-focused-lint-20261005-01` | exit 0 | `4a4b6f8ccfcf` | [原始日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/r3-06-focused-lint-20261005-01/20261005T153316620930.txt) |
| `r3-06-focused-strict-20261005-01` | exit 1 | `4a4b6f8ccfcf` | [原始日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/r3-06-focused-strict-20261005-01/20261005T153354720000.txt) |
| `r3-06-focused-strict-20261005-02` | exit 0 | `a7fc95c42a69` | [原始日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/r3-06-focused-strict-20261005-02/20261005T153530236403.txt) |
| `r3-06-valid-ab-20261005-01` | 2 pass / 0 fail / 0 skip | `26ac89026cdc` | [原始日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/r3-06-valid-ab-20261005-01/20261005T152859263031.txt) |
| `r3-06-valid-ab-repeat-20261005-01` | 2 pass / 0 fail / 0 skip | `4a4b6f8ccfcf` | [原始日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-restore/r3-06-valid-ab-repeat-20261005-01/20261005T153154334931.txt) |

**有效 Nx 执行 6 条：3 条真实聚焦测试执行（6 条用例执行：5 pass、1 历史基线 fail、0 skip），1 条零警告 lint，2 条 strict（夹具 UUID 拓宽红 → 收窄后绿）。唯一场景 2 条；重复运行不算新增场景。** 必要对照已绿，无需继续测试。lint 不是全包 lint，strict 不是 release build，不能扩大发布口径。

解析过 `nx show project --json`：test 是 `nx:run-commands`/cwd 本包/command vitest，原 dependsOn 为 ^build。全部运行显式排除依赖任务和 sync，CI=true / NX_DAEMON=false，skipRemoteCache / skipNxCache；真实测试 maxWorkers=1，不跑依赖 build、全包测试或 GUI。精确可复跑命令存各 status/原始日志，重跑必须另选唯一 --name。

## 主控编号与 C 核销

- 主控 **R3-06**：源码审阅 / 归属意见 **已交付**；Replay core 故障候选不成立，更强 WorkingTree 投影契约 **pending**，不是“审阅没做”。
- **C4 子面核销**：真实 PGlite 的合法最小调用、目标内容进入 diff、HEAD/历史不动、dirty/unreachable、disconnectAll 拒绝、fresh discard 可退场。**原完整 C4 保持 partial，完整原 C 新闭合数 +0**；其 CAS 竞争/不兼容/中断重试/resume 不由这一组证据代验，不继续扩展。
- C1 原限定闭合保留；C2/C3/C5、完整对象及发布门禁不改口径。
- 只改原评审新增 probe、此证据目录、对象结果的 R3 追加段。原普通测试、业务、依赖、index 与主控清单没有由本线程写入。
- 既有 `transformWithEsbuild` deprecation 保留在日志中；不是 ESLint 零警告结论，也没有越权修改工具配置。
