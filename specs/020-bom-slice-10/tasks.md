# Tasks: BOM 第 10 步

**Input**: [spec.md](spec.md)、[plan.md](plan.md)、[research.md](research.md)、[BOM View 契约](contracts/bom-view-api.md)。
**状态**: 本文件记录待实施任务，不将静态阅读、编译失败或尚未执行的 spike 记为业务回归通过。

## Phase 1: 规格复核

- [ ] T001 主会话复核 `specs/020-bom-slice-10/spec.md`、`plan.md`、`research.md`、`contracts/bom-view-api.md` 的范围与 constitution 门禁，沿当前分支实施；本次规格阶段不创建分支、不提交。

## Phase 2: US0 路线停用前置缺口

**目标**: 先关闭 US-520 AC#11 / US-524 AC#7 的真实消费方缺口，避免三端工序编辑建立在半完成语义上。
**独立验收**: 双后端在停用前、当天及之后验证单工序/分摊；数量、成本、导出明确点名失效路线与发生项。

- [ ] T002 [US0] 在 `packages/rxdb-plugin-bom/src/__tests__/bom-routing.spec.ts` 补路线 `[validFrom, disabledAt)` 边界、单工序/分摊及数量/成本/导出未覆盖拒绝回归，主会话确认预期功能红。
- [ ] T003 [US0] 在 `packages/rxdb-plugin-bom/src/quantity/explosion.ts`、`quantity/cost.ts` 及其共享工序读取路径落实统一路线有效域；检查 `resolve/integration.ts` 的导出消费链，不把失效路线当作无工序。
- [ ] T004 [US0] 用 `packages/rxdb-plugin-bom/src/__tests__/bom-routing.spec.ts` 与现有数量/成本/导出回归证明修复及历史计算兼容，将红/绿证据写入 `specs/020-bom-slice-10/research.md`。

## Phase 3: 共享 Fixture 与依赖 Spike

**阻塞规则**: AC#6～#9 的实际依赖行为与快照合同收敛前，不并行冻结三端 API 或发明新引擎注册面。

- [ ] T005 在 `packages/rxdb-plugin-bom/src/testing/bom-view-fixture.ts` 与 `testing/index.ts` 建立三端共用的确定性 fixture：多重边、共享子装配、draft/ECN、未来生效日、phantom、换算率、工序与三类候选。
- [ ] T006 在 `packages/rxdb-plugin-bom/src/__tests__/bom-view.spec.ts` 先补 AC#6～#9 的双后端真实事件/上下文失败回归，覆盖原结果从未引用的新 ECN 行，不以手动 refresh 或 sleep 冒充自动刷新。
- [ ] T007 在 `packages/rxdb-plugin-bom/src/repository.ts` / `view.ts` 用现有 `QueryManager.createTask`、`RepositoryQueryExtensions`、`relationEntityTypes`、`autoCache: false` 完成依赖 spike；比较作用域、数据库隔离与任务指纹，不预设改动 `packages/rxdb/src/`。
- [ ] T008 根据实际 spike 更新 `specs/020-bom-slice-10/research.md` 与 `contracts/bom-view-api.md`，冻结快照/状态、完整数量消费、编辑 patch 与 handle 生命周期细项；若通道确实不足，先记录可复现证据与最小计划再改引擎。
- [ ] T009 通过 `nx-generate` 发现合适生成器，再由主会话生成 `packages/rxdb-plugin-bom-angular/`、`rxdb-plugin-bom-react/`、`rxdb-plugin-bom-vue/` 的现有风格配置；用包管理器 workspace 命令链接依赖，不以 tsconfig 别名代替真实依赖。

## Phase 4: US1 共享活查询与状态

**目标**: 一个共享 kernel 管订阅、刷新、输入切换与生命周期。
**独立验收**: 四类依赖变化自动刷新；同库多 handle、不同库、连续输入切换、最后订阅释放与迟到结果正确。

- [ ] T010 [US1] 在 `packages/rxdb-plugin-bom/src/__tests__/bom-view-lifecycle.spec.ts` 补初始/刷新状态、同库多视图、异库隔离、迟到结果、释放与重订阅失败回归，使用受控事件或承诺完成点等待。
- [ ] T011 [US1] 在 `packages/rxdb-plugin-bom/src/view.ts`、`repository.ts`、`plugin.ts` 与 `index.ts` 收口 `watchView(input)`，完整输入参与任务身份，指纹包含实际显示值与完整性状态，复用经过 spike 验证的保守依赖。
- [ ] T012 [US1] 在 `packages/rxdb-plugin-bom/src/view-state.ts` 实现 `createBomView` 的 `state$`、`setInput`、`refresh`、`toggle`、销毁与命令装配，后台刷新保留旧节点，框架不复制业务状态机。

## Phase 5: US2 路径、候选与完整消费

**目标**: 可浏览未解析结构，按路径保持身份与独立展开；完整计算有明确拒绝边界。
**独立验收**: 三重边、共享子树、截断及三类候选均可区分，数量/成本/导出不消费不完整结果，原 23 条 demo 行为保留。

- [ ] T013 [US2] 在 `packages/rxdb-plugin-bom/src/__tests__/bom-view.spec.ts` 补路径身份、独立折叠、三类未解析、截断与完整数量/成本/导出拒绝回归，并保留现有部分 `explodeBom` / manifest 兼容断言。
- [ ] T014 [US2] 在 `packages/rxdb-plugin-bom/src/view.ts` / `view-state.ts` 实现供树惰性呈现的路径投影、候选与截断信息、完整消费检查；复用既有数量 kernel，不在 UI 重写计算或默认挑候选。

## Phase 6: US3 合法发生项编辑

**目标**: 四字段编辑来自统一仓储与错误合同，已发布既有发生项只读。
**独立验收**: 草稿 qty/组件损耗/operationSeq/生效期保存有真实消费结果；draft ECN 新发生项可改；成环错误三字段一致。

- [ ] T015 [US3] 在 `packages/rxdb-plugin-bom/src/__tests__/bom-view-editor.spec.ts` 补草稿四字段、draft ECN 新发生项、已发布既有发生项只读、成环 `code/payload/message` 及路线失效回归，先确认功能红。
- [ ] T016 [US3] 在 `packages/rxdb-plugin-bom/src/view-state.ts` 接入独立 `loadOccurrence(id)` / `saveOccurrence(patch)`，经既有仓储按真实状态保存；不自动创建/发布/取消 ECN，不发明自动换行协议。

## Phase 7: US4 三端绑定与可复用组件

**目标**: 三端同名 `useBomView` 与 `BomTree` / `BomLineEditor`，仅 state 的框架容器不同。
**独立验收**: 相同 fixture 在三端得到同一业务状态、命令结果、字段能力与只读/错误行为；四状态与生命周期真实挂载可验。

- [ ] T017 [P] [US4] 在 `packages/rxdb-plugin-bom-angular/src/__tests__/use-bom-view.spec.ts` 与组件 `*.spec.ts` 编写 signal 绑定、销毁、四状态、惰性行和编辑器的真实挂载失败回归。
- [ ] T018 [P] [US4] 在 `packages/rxdb-plugin-bom-react/src/__tests__/use-bom-view.spec.ts` 与组件 `*.spec.tsx` 编写 plain snapshot 绑定、重复挂载/卸载、四状态、惰性行和编辑器失败回归。
- [ ] T019 [P] [US4] 在 `packages/rxdb-plugin-bom-vue/src/__tests__/use-bom-view.spec.ts` 与组件 `*.spec.ts` 编写 ref 绑定、scope 清理、四状态、惰性行和编辑器失败回归。
- [ ] T020 [P] [US4] 在 `packages/rxdb-plugin-bom-angular/src/use-bom-view.ts`、`bom-tree.ts`、`bom-line-editor.ts`、`index.ts` 实现薄绑定及组件，复用共享 handle；有标签表单、只读原因、键盘、刷新状态和视觉规则齐备。
- [ ] T021 [P] [US4] 在 `packages/rxdb-plugin-bom-react/src/use-bom-view.ts`、`bom-tree.tsx`、`bom-line-editor.tsx`、`index.ts` 实现同名同语义绑定及组件，不复制领域规则。
- [ ] T022 [P] [US4] 在 `packages/rxdb-plugin-bom-vue/src/use-bom-view.ts`、`BomTree.vue`、`BomLineEditor.vue`、`index.ts` 实现同名同语义绑定及组件，不复制领域规则。
- [ ] T023 [US4] 在 `modules/e2e-parity/bom-view-parity.mjs` 与 `.d.mts` 建三端共用行为断言；AC#2 必须保存浏览器真实 Element 并比较引用，不用行数、截图、testid 相同或 render 次数替代。
- [ ] T024 [P] [US4] 在 `apps/dev-rxdb-angular/src/` 接入同 fixture 的 BOM 消费页，`apps/dev-rxdb-angular-e2e/src/bom-view.spec.ts` 调用共享 AC#2～#12 场景，含实际 kernel ECN 发布。
- [ ] T025 [P] [US4] 在 `apps/dev-rxdb-react/src/` 接入等价消费页，`apps/dev-rxdb-react-e2e/src/bom-view.spec.ts` 运行相同共享场景与业务断言。
- [ ] T026 [P] [US4] 在 `apps/dev-rxdb-vue/src/` 接入等价消费页，`apps/dev-rxdb-vue-e2e/src/bom-view.spec.ts` 运行相同共享场景与业务断言。
- [ ] T027 [US4] 主会话统一验证三个 `apps/dev-rxdb-*-e2e/src/bom-view.spec.ts`：AC#1 汇总对称性、AC#2 真实引用、独立折叠、四字段编辑、候选/拒绝、四状态、视觉语义及 WCAG 2.1 AA 键盘/焦点/标签；任一端缺失保持未完成。

## Phase 8: 性能、文档与门禁

- [ ] T028 在 `benchmarks/bom.bench.ts` 与三端浏览器场景测 100 节点查询/保存/刷新到 DOM/首屏，记录 p50/p95/max、环境和原始样本；在 `specs/020-bom-slice-10/quickstart.md` 记录每包入口及静态 gzip、完整动态体积，预算超限先修。
- [ ] T029 更新 `packages/rxdb-plugin-bom/README.md` 与三个 `packages/rxdb-plugin-bom-*/README.md` 的等价 `useBomView` / 组件示例、容器区别、生命周期、候选完整性与发布只读边界，公共导出补中文 TSDoc。
- [ ] T030 主会话集中跑核心与三端包的 strict、零警告 lint、测试/覆盖率、build 与 `tri-framework-check`；非核心四项 ≥80%，若改核心则对应 ≥90%，保留原 23 条 `apps/dev-rxdb-bom-e2e/src/bom-demo.spec.ts` 全量回归。
- [ ] T031 更新 `requirements/api-baseline/` 与包图生成物，完成 API、包图、需求一致性、构建入口、覆盖率五项审计及格式检查；核对 `specs/020-bom-slice-10/contracts/bom-view-api.md` 与三端实际导出相符。
- [ ] T032 主会话按受影响范围集中执行当前分支 Nx 门禁，使用本环境配置与本地缓存，重负载串行/分段；实际命令、失败原因、修复与补齐结果记录到 `specs/020-bom-slice-10/quickstart.md`，不虚构单条命令首次全绿。
- [ ] T033 按实际验收证据回写 `requirements/stories/domain/US-522-bom-tri-framework-ui.md`、US-520 AC#11、US-524 AC#7 及 `specs/020-bom-slice-10/`；其他旧故事仅凭独立审计证据回写，价值待证范围不关闭，本次文档子任务不提交。

## AC 覆盖矩阵

| 验收                       | 对应任务与证明                                                       |
| -------------------------- | -------------------------------------------------------------------- |
| US-520 AC#11 / US-524 AC#7 | T002～T004：双后端有效域、未覆盖与数量/成本/导出消费。               |
| US-522 AC#1                | T017～T027、T029～T031：三端完整同场景、API 与文档对称。             |
| AC#2                       | T014、T020～T027：ECN 改量后的数量更新、无关路径真实 DOM 引用保持。  |
| AC#3                       | T015～T022、T024～T027：同一成环错误 code/payload/message。          |
| AC#4                       | T013～T014、T020～T027：真实截断与可见原因。                         |
| AC#5 / AC#10               | T005、T013～T014、T020～T027：三重边及共享子树路径独立。             |
| AC#6～#9                   | T006～T012、T023～T027：四类实际依赖变化、上下文切换、三端可见刷新。 |
| AC#11                      | T002～T004、T015～T022、T024～T027：四字段编辑与真实发布边界。       |
| AC#12                      | T013～T014、T020～T027：三类候选可浏览，完整数量/成本/导出拒绝。     |

## Dependencies & Parallel Execution

顺序：T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008。T008 后可建立三个包；T010 在生产 handle 前先红，T011/T012 接其后；T013/T014 与 T015/T016 在共享文件上串行收口，避免同时修改 `view-state.ts`。

- 三端测试 T017/T018/T019 可按包并行编写，主会话先集中确认各自功能红，再推进实现。
- T020/T021/T022 分属三个包，可并行实现；T024/T025/T026 在共享场景 T023 与对应组件完成后可并行接消费页。
- 共享 fixture、API 导出、仓储/插件、状态文件、baseline 与生成物由主会话串行接线。所有 Nx 只由主会话启动，子任务不跑构建/测试，不争用 dist。
- T028～T033 在全部独立验收通过后收口；性能、覆盖率或对称失败必须修复后再关闭任务。

## Implementation Strategy

内部最小切片为路线前置修复 + 经过真实依赖 spike 的共享 watchView/state；它用于降低接口风险，不表示 US-522 已交付。首次对外交付必须同时完成三端绑定、树与编辑器以及全部 12 条 AC，不能把单框架完成计作本故事完成。

本次文档生成只新增指定五份文件；研究中的待 spike 项是主会话实施任务，不是需要用户重复确认的产品范围问题。
