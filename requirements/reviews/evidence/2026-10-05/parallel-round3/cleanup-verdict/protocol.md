# R3-05 cleanup verdict 补证协议

- 2026-10-05：先封存 `baseline/sourcehash.json`（rxdb-test 原有 115 文件）、旧候选/日志/原测试、resolved Nx 目标；新 spec 原先不存在。
- 独占文件：`packages/rxdb-test/src/__tests__/review-round3-cleanup-verdict.spec.ts`。不修改原 suite / 原 test / 生产实现 / 依赖 / index；不暂存或提交。
- 使用原 suite 的 `describe / it / afterEach`，不 mock Vitest、不捕获/手工重放注册回调，不使用 skip / only / testNamePattern。
- 类型化内存替身只供应业务断言成功所需的 connect/query/save/transaction/repository 返回值。**不是物理数据库或真实适配器的合规证据。** adapter.disconnect 明确拒绝，并由 factory.dispose 原样向上拒绝；本地 RxDB.destroy 仅回收模型元数据。
- 三个独占 spec 模式，`RXDB_REVIEW_R3_CLEANUP_MODE`：
  1. `direct`：相同工厂 + 成功 body + 直接 await dispose 的真实 afterEach；正常关闭应绿，拒绝关闭应红（1 pass / 1 fail，exit 1）。
  2. `shared`：三套原事务共享 suite × 正常/拒绝关闭，所有原 body 断言都应成功；bootstrap probe 此模式正常关闭，以隔离普通 opened 数据库的 cleanup。预期 22 pass，exit 0；20 个 opened 数据库里 10 个 close/ dispose 明确拒绝。
  3. `probe`：原 bootstrap suite，普通数据库正常关闭、probe 明确拒绝；前两例应绿，第三例业务预期的回滚断言成功后，finally 的 dispose 应使它红（2 pass / 1 fail，exit 1）。
- 所有运行仅聚焦该 spec、1 worker、关闭文件并行、CI=true / NX_DAEMON=false / FORCE_COLOR=0 / CODECOV_TOKEN 空。Nx `test` resolved 为 `nx:run-commands` → `vitest`，`dependsOn: ^build`；用本地 Nx 参数定义确认的 `--excludeTaskDependencies` 禁止展开构建依赖，`--skipRemoteCache --skipNxCache`，不跑全仓。
- 所有测试命令必须经 `python3 /tmp/rxdb-review-round3-locked.py --name cleanup-verdict/<唯一名> --scope packages/rxdb-test -- pnpm nx run rxdb-test:test ...`。保留 raw log、exit status、JSON reporter、输入 hash、模型 trace。不上子 Vitest 进程。
- strict 类型检查仅新 spec，临时配置放本证据目录；ESLint 零警告，仅新 spec；均经 Nx + 共享锁。原有 3 红 / 3 绿不重跑，旧证据不覆盖。
- 判定：实际共享 runner 忽略拒绝属于动态事实；是否“错误”必须区分 suite 的 C1/C2/C3 业务不变式与工厂“释放资源”协议，不把清理尝试等同资源隔离保证。主控去重裁定 RV，不在本子任务编号。
