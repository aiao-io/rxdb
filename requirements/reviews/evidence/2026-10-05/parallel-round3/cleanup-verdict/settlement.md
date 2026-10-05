# R3-05 结算：成功 body + cleanup 拒绝

2026-10-05。**补证已冻结，不扩事务 suite / harness 组，不跑全量门禁。**

## 最小对照已成立

同一工厂模型，body 都完成 `connect` 和 `query`；adapter.disconnect 明确 reject，factory.dispose 原样 reject（同一 Error 身份断言），调用均恰好一次。

| 注册 / cleanup 路径 | body | disconnect / dispose | 用例状态 | 真实整次 runner exit |
| --- | --- | --- | --- | --- |
| 新 spec 直接 `afterEach await dispose` 正常对照 | 成功 | resolve / resolve | pass | 此次含拒绝对照，exit 1 |
| 新 spec 直接 `afterEach await dispose` 拒绝对照 | 成功 | reject / reject | fail，唯一错误 R3_CLOSE_REJECT | exit 1 |
| 原 readiness「引导完成后普通查询仍能正常入队执行」正常对照 | 成功 | resolve / resolve | pass | exit 0 |
| 同一原 readiness 用例，拒绝对照 | 成功 | reject / reject | **pass** | **exit 0** |

四个精确用例、原始 failureMessages 和对应 trace 固化在 [minimal-control.frozen.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/minimal-control.frozen.json)。没有 mock Vitest、没有手工重放 suite body / hook、没有 skip/only/name 过滤。原共享注册与原 afterEach 由真实 Vitest 执行。

## 已执行输出（冻结后不再增加）

| 测量 | passed / failed / pending | 真实 exit | 清理拒绝计数 |
| --- | --- | --- | --- |
| direct | 1 / 1 / 0 | 1 | 1 个数据库 |
| shared：原 readiness 4 + bootstrap 3 + isolation 4，正常/拒绝各一次 | **22 / 0 / 0** | **0** | **10 个 opened 数据库**；另 10 个数据库与 2 个 probe 正常关闭 |
| probe：原 bootstrap，普通数据库正常 / probe 拒绝 | 2 / 1 / 0 | 1 | 1 个 probe，原 finally 传播失败 |

业务期望内的 rollback / createTables 负例是原 suite 的成功断言，不是旧 harness 的故意 connect 失败。共享拒绝组里 10 个数据库都在业务成功之后触发关闭拒绝。probe 对照完成 expected createTables rejection + 两次 tableExists=false 后，唯一最终失败为 probe 关闭错误；证明不能说「所有 cleanup 都吞」。

三个原始输出目录：[direct](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/runner-direct-01)、[shared](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/runner-shared-01)、[probe](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/runner-probe-01)；各有锁脚本 status/raw log、Vitest JSON、cases、trace、spec 前后 hash。[comparison.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/comparison.json) 是机器核对，不是重新运行。

## 设计 best-effort 与错误假绿的边界

- 动态事实：成功业务 body + 明确 dispose 拒绝仍使原共享 runner 全绿。若用「套件绿」证明关闭成功或环境完全回收，这个推断是假的。
- 公开边界：`src/transaction/index.ts:1-10` 只声明 C1 就绪门 / C2 事务作用域 / C3 引导原子性；`types.ts:65-66` 要求释放资源、connect 失败也安全调用，**没有显式写 cleanup 失败必须让 runner 红**。
- 原 shared hook：`bootstrap.suite.ts:43-46`、`readiness.suite.ts:35-38`、`isolation.suite.ts:57-60` 明确 best-effort catch。原 sqlite-wasm、PGlite、Electron-PGlite 工厂自身还对 `rxdb.disconnectAll()` catch；因此这是两层清理观测策略，而不是证明某一业务后端事务错误。
- 不同路径：`bootstrap.suite.ts:85-90` 的 probe finally 直接 await；本轮已动态证明 probe 关闭失败会红。不能把它合并进 swallowed cleanup 候选。
- 裁定条件：若 cleanup best-effort 是契约选择，C1/C2/C3 的业务绿不构成契约错误，但不能外推为资源隔离保证；若整体 conformance 绿必须含关闭成功，则 opened cleanup 吞错是测试判别力候选。**主控裁定，不自行分配 RV。**

## 候选 / 收尾统计

- 仅补强既有 `CORE-PENDING-3`，**新增独立候选 0、主 RV 确认 0**；主 RV 契约判断仍待主控。
- 闭合 1 个有界补证缺口：成功 body + 拒绝 cleanup + 真实 runner exit。不得当成整事务组、完整 C1/C2 或全包收尾。
- 候选仅限三原 suite 的 opened 数据库 afterEach 对 rejected Promise 的不可观测性；不含 probe finally，不新增其他已确认问题。
- 替身的连接、仓储、事务排队和写入返回值只保证原 body 可成功执行。**未运行真实数据库 / OS 句柄故障，不证明物理泄漏、后端关闭故障率或后续用例污染。**

## 质量 / 输入 / 修改边界

- 新 spec SHA256：`f8a8e3d431c112793ec19650e8cbaa5e3ccf57e7c7dd0dd46f396b9af8001eb3`；三测试和最终 strict/lint 前后相同。
- 原 rxdb-test **115 文件 SHA 未变**；另已读 core / adapter factory 文件 hash 也未变。原测试、原 suite、依赖、index 均未修改。
- 先保存 sourcehash、旧证据、旧 spec、resolved Nx 目标；旧 3 红 / 3 绿不重跑、不覆盖。HEAD 在并行工作中跨批次推进，使用 sourcehash 核对；各测试批次 HEAD 起止一致、`changedInputsDuringMeasurement=[]`。
- 新 spec 专属 strict 检查通过、专属 ESLint `--max-warnings=0` 通过。初版替身 TS2358 仅在新 spec 修正为 unknown 类型收窄，初版与失败日志保留；没有 any、降 strict 或忽略警告。
- 所有测量经指定共享锁 / scope / 唯一 name；真实 test 为 1 worker、无文件并行，CI=true、NX_DAEMON=false、双缓存关闭、`excludeTaskDependencies`，没有依赖构建或全仓执行。
- 新增指定 spec 与本 evidence 目录，只追加 results/packages/rxdb-test.md；本任务不执行 git 暂存 / 提交。无后续待跑测试。
