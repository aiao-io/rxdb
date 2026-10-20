# Tasks: BOM 第 9 步

**Input**: spec.md、plan.md、research.md、data-model.md、contracts/instance-api.md。

## Phase 1: 规格与共享基础

- [x] T001 完成 specs/019-bom-slice-9/ 的规格、计划、研究、模型、契约与质量清单。
- [x] T002 在 `packages/rxdb-plugin-bom/src/__tests__/bom-instance.spec.ts` 与 bom-instance-source.spec.ts 编写失败回归，主会话确认红。
- [x] T003 在 packages/rxdb-plugin-bom/src/entities.ts、types.ts、plugin.ts、index.ts 接入共享实体、排他、错误与查询门面。

## Phase 2: US1 实例事实与查询

- [x] T004 [P] [US1] 在 packages/rxdb-plugin-bom/src/instance.ts 实现独立实例展开、历史和反查，补固定实际修订及预算双后端测试。

## Phase 3: US2 物理约束

- [x] T005 [P] [US2] 在 packages/rxdb-plugin-bom/src/backend/instance-node-ddl.ts 实现序列必填、实例环与事实保护，补相邻/重叠、单父及直连 SQL 测试。

## Phase 4: US3 来源保护

- [x] T006 [P] [US3] 在 packages/rxdb-plugin-bom/src/backend/instance-source-ddl.ts、backend/bom-trigger-ddl.ts 实现来源删除与 ECN 级联前置守卫，仅随实例注册安装。
- [x] T007 [US3] 在 packages/rxdb-plugin-bom/src/repository.ts 原子化发生项删除，验证失败后全部子表、状态与截止标记不变。

## Phase 5: US4 规模隔离

- [x] T008 [US4] 在 `packages/rxdb-plugin-bom/src/__tests__/bom-instance-scale.spec.ts` 验证建实例前后主数据摘要、下钻/反查结果及计划不变：2026-10-16 两端各一次性实跑 1000 台/10 万节点（见 quickstart）；2026-10-17 起常驻回归为 100 台/1 万节点（b7e80ef2，CI 上 1000 台超 10 分钟）。
- [x] T009 [US4] 在 benchmarks/bom.bench.ts 测实例关键路径 p95，记录静态/动态 gzip 与首屏至 specs/019-bom-slice-9/quickstart.md。

## Phase 6: US5 演示阶段 F

- [x] T010 [P] [US5] 在 packages/rxdb-plugin-bom/src/testing/scooter-dataset.ts 接回 SC-100 两台实例与草稿来源种子，保持 A～E golden。
- [x] T011 [US5] 在 apps/dev-rxdb-bom/src/app/pages/instances/、bom-demo.service.ts、components/app-shell.ts 接入追溯页与完整交互状态。
- [x] T012 [US5] 在 apps/dev-rxdb-bom-e2e/src/bom-demo.spec.ts 先补 AC#21/#22 失败用例，再完成 23 条全量 e2e。

## Phase 7: 门禁与回写

- [x] T013 跑 packages/rxdb-plugin-bom 全测试、lint/typecheck/build、四项覆盖率并收敛缺口。
- [x] T014 更新 requirements/api-baseline/rxdb-plugin-bom.json 及包图生成物，完成五项审计与 pnpm nx format:check。
- [x] T015 跑当前分支 affected 全范围，重负载目标按前轮证实方式串行，不绕过本地缓存。
- [x] T016 回写 requirements/stories/domain/US-523-bom-as-built-instance.md、US-525、epic-009、roadmap/status-overview 与 specs/019-bom-slice-9/ 验收记录，正常本地提交。

## 集成发现的必要修复

- [x] T017 在 `packages/rxdb-plugin-bom/src/__tests__/bom-instance-source.spec.ts` 保留单工序合法比例 1 的发布失败回归，修复 backend/bom-trigger-ddl.ts 双后端整数分摊聚合；在 T013～T016 门禁前完成。
- [x] T018 修复 benchmarks/bom.bench.ts 暴露的导出 p95 16.75ms 超预算：在 packages/rxdb-plugin-bom/src/resolve/integration.ts 每行只构造一次排序自然键，复验导入导出回归和性能，再收口门禁。
- [x] T019 在 `packages/rxdb-plugin-bom/src/__tests__/bom-instance-upgrade.spec.ts` 验证真实持久化 A～E 库升级实例 schema 后主数据不变、F 与来源保护可用。
- [x] T020 在 apps/dev-rxdb-bom-e2e/src/bom-demo.spec.ts 补首次空库状态失败回归，修复 bom-demo.service.ts / components/app-shell.ts 的连接装载顺序与状态标签，禁止空库创建悬空演示修订。
- [x] T021 将分支门禁发现的 Vue 普通文本未失焦重绘丢值补成确定性失败回归，最小修复输入同步，并复验 Vue 模型包与完整 e2e；登记既有断言辅助函数，零警告 lint 通过。

## 并行纪律

共享实体/插件/导出/错误由主会话写；子任务按文件并行。所有 Nx 验证由主会话集中串行启动，先确认红再实现，避免共享 dist 竞争。

依赖顺序：T001 → T002 → T003；共享基础完成后 T004/T005/T006 并行，T007 接 T006；T008 需实例写入与查询完成，T009 需 T004/T005；T010/T011/T012 消费实例 API，先页面红再实现。T013～T016 在各故事独立验收通过后串行收口。

独立验收：US1 覆盖实际修订与历史/追溯；US2 覆盖直连写入与物理不变量；US3 比较拒绝前后的完整快照；US4 实例节点数精确对照（常驻回归 100 台 × 100 = 10000，一次性实跑 100000）；US5 保留原 21 条并新增 2 条端到端用例。最小可用切片为 US1，最终交付仍关闭本步全部任务。
