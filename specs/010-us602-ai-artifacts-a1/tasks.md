# Tasks: US-602 A1

## Phase 1: Setup

- [x] T001 在 specs/010-us602-ai-artifacts-a1/ 完成 spec/plan/research/data-model/contracts/quickstart
- [x] T002 在 package.json 添加 Nx 审计/脚本测试/样例目标并用 pnpm 声明样例开发依赖

## Phase 2: US1 初始化与事务说明

独立验收：实际 tgz 声明与严格编译的样例一致，受控队列证明反例重新排队。

- [x] T003 [US1] 在 `scripts/audit/__fixtures__/ai-entry-docs/` 与 ai-entry-docs.spec.mjs 先写声明审计正反例并确认红
- [x] T004 [US1] 在 packages/rxdb/src/RxDB.ts、rxdb-adapter.ts、transaction/transaction-executor.interface.ts、entity/entity-base.ts 补入口中文 TSDoc
- [x] T005 [US1] 在 scripts/audit/ai-entry-docs.mjs 实现按符号与重载的声明审计
- [x] T006 [US1] 在 `packages/rxdb-adapter-pglite/src/__tests__/transaction-executor.spec.ts` 加受控队列负例并验证

## Phase 3: US2 包事实与组合

独立验收：所有正例过、缺包/槽位冲突/依赖环/前置缺失均被拒绝，真实范围登记完整。

- [x] T007 [US2] 在 `scripts/audit/__fixtures__/package-graph/` 和 package-graph.spec.mjs 写发现、角色、情景、inject、环路正反例并确认红
- [x] T008 [US2] 在 requirements/package-graph.json 登记全量语义事实与首版情景
- [x] T009 [US2] 在 scripts/audit/lib/package-graph-*.mjs 与 package-graph.mjs 实现发现、AST 前置、闭包与门禁
- [x] T010 [US2] 在 scripts/audit/docs-plugin-surface.mjs 删除 QueryCache 人工清单并改从事实源读取

## Phase 4: US3 生成与离线验证

独立验收：重复生成一致、版本过滤正确、篡改会失败，离线 CRUD 和事务正常退出。

- [x] T011 [US3] 在 scripts/audit/package-graph.spec.mjs 加生成、发布范围、摘要、模板/样例漂移正反例并确认红
- [x] T012 [US3] 在 scripts/examples/ai-local/ 与 scripts/audit/ai-example.mjs 完成完整样例、严格编译运行及实际 tgz 检查
- [x] T013 [US3] 在 scripts/audit/templates/ 与 requirements/generated/ 完成稳定知识生成与 --check
- [x] T014 [US3] 在 package.json、packages/rxdb/project.json、website/project.json、.github/workflows/ci-template.yml 接 CI 与 Nx 输入

## Phase 5: Verification

- [x] T015 在 requirements/epics/epic-007-public-api-gates.md、status-overview.md、roadmap.md、US-602-ai-comprehensible-artifacts.md 回写 A1 与证据
- [x] T016 通过 Nx 运行脚本、真实漂移门禁、离线样例、打包声明、lint/typecheck/test/build 与覆盖率门禁
- [x] T017 通过 Nx 串行执行 affected 全量校验并在 specs/010-us602-ai-artifacts-a1/quickstart.md 记录结果与性能

## Dependencies and implementation strategy

T001 → T002；US1 与 US2 可按文件分开验证，US3 依赖 US2。实际执行先 US1，再 US2/US3，再派生文档与全量校验。
可并行的是读取配置与独立验证；代码改动按任务顺序执行。可选 Git hooks 本次跳过。
