# Implementation Plan: BOM 第 10 步

**Branch**: `claude/bom-related-work-77235b` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

## Summary

先补路线有效域消费的真实缺口，再完成 US-522 全部 12 条 AC：共享 BOM kernel 提供派生活查询与交互状态，Angular/React/Vue 仅绑定框架容器并提供同名 `useBomView`、`BomTree`、`BomLineEditor`。已有主数据与实例能力保持兼容，三端缺任一能力即未完成。

流程为规格 → 计划 → 任务 → 前置红/绿 → 主会话依赖 spike → 收敛快照契约 → kernel → 三端同时消费 → 联合验收。当前阶段只编写指定五份规格文档，保留当前分支，不生成代码、执行 Nx 或提交；现有 Spec Kit Git 钩子不覆盖用户明确的分支与提交约束。

## Technical Context

- **语言与运行时**：仓库现有 TypeScript strict、Node 26、pnpm 10、Nx 23；Angular 22、React 19、Vue 3.5、RxJS 7.8。
- **复用依赖**：`Repository.queryManager.createTask()`、`RepositoryQueryExtensions`、`QueryTask.relationEntityTypes`，以及现有 BOM resolve/expand/explode、完整性检查、错误与写入协议。
- **存储**：已有 SQLite/PGlite BOM 实体；不新增持久化视图表，不把框架状态或折叠状态写入主数据。
- **测试**：Vitest 双后端 kernel/生命周期回归；真实组件测试；三端 Playwright 共用 fixture 与断言，记录并比较真实 DOM 元素引用。
- **交付**：现有 `rxdb-plugin-bom` 共享层加三个 `rxdb-plugin-bom-{angular,react,vue}` 薄绑定包，以及三个现有框架 demo 的消费页与文档。
- **范围**：US-522 AC#1～12、US-520 AC#11 / US-524 AC#7；其他状态漂移由独立证据审计后回写，不作为本轮额外开发。

## Constitution Check

| 原则     | 本轮门禁与证明方式                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码质量 | strict、ESLint 零警告、无 `any`、公共符号中文 TSDoc、最多三层嵌套；领域错误与数量语义只在共享层产生。                                                         |
| 测试     | 前置缺口与 AC#6～#9 先真实跑红再实现；新增/受影响非核心包四项覆盖率 ≥80%；若 spike 证明需改核心及三端基础包，则对应四项 ≥90%。                                |
| 体验一致 | 三端同名输入、state/commands 与组件业务行为；四状态、后台刷新、保存进度、键盘、标签与 WCAG 2.1 AA；DOM 可异构，视觉语义一致，未变路径元素引用必须相同。       |
| 性能     | 100 节点预热派生查询 p95 <16ms、保存 <100ms、更新到可见结果 <100ms、首屏 <1.5s；每包入口及静态依赖 gzip <50KB，完整分块另报。超限先修，不能改写预算为已通过。 |
| 兼容     | 保留已交付 BOM kernel 与原 23 条演示行为；不得将既有可浏览的部分结果强行改成全局失败来实现新消费边界。                                                        |

设计复核：采用一个共享派生查询/状态层与三个薄容器适配，不复制领域逻辑。生命周期与渲染是本故事已有病灶，不新增通用响应式引擎。当前无已批准例外；若 spike 证明现有通道不足，先以实际失败证据更新计划与任务，再决定最小改动。

## Phase 0: 前置与依赖 Spike

### 路线有效域先红后修

在 `packages/rxdb-plugin-bom/src/__tests__/bom-routing.spec.ts` 补真实双后端用例：停用前、停用当天、停用后，覆盖单工序挂接与分摊，错误同时点名路线和发生项。有效域为 `[validFrom, disabledAt)`；没有路线与已选路线失效是两种语义。

数量、成本和导出的消费链复用同一有效域检查；先保留原计算结果，再做最小修复。保存期继续负责引用完整性，不用路线停用删除历史工序或改写已发布行。修改路线状态也应能使活视图失效。

### 依赖注册 Spike：主会话集中执行

先复用 `QueryManager.createTask({ options, runner, getFingerprint, relationEntityTypes, autoCache: false })`，参照 `GraphRepository.createGraphTask()` 的派生查询先例；查询类型可使用现有 `RepositoryQueryExtensions` 扩展。首次 spike 不预设新增引擎 API。

使用真实数据库与事件，先证明以下四类变化均会触发重算：

1. 原结果不可见且从未参与的 draft ECN 新行，因 ECN 发布而进入结果（AC#6）。
2. 输入日期推进使行生效（AC#7）。
3. imprecise 子件发布新修订（AC#8）。
4. 新修订改变 phantom 默认值、或物料换算率改变（AC#9）。

保守依赖覆盖头、逻辑行、发生项、ECN、物料、修订、位号、替代组、配置模型、路线/工序及分摊等实际读取实体。注册 ECN 依赖不以旧结果 occurrence ID 过滤。允许作用域外同类型事件带来额外重算，先保证不漏刷新，再考虑缩小依赖。

任务身份必须包含完整 `BomViewInput` 的所有业务输入，并依托明确的数据库实例隔离。指纹包含实际显示值、数量、候选、截断与错误信息，不能只取节点 ID。不同上下文、预算、参数或数据库不得相互污染缓存。

本计划尚未声称 spike 已通过；证据、节点投影与错误快照细项补入 [research.md](research.md) 与 [契约](contracts/bom-view-api.md) 后，才冻结三端实现输入。

## Phase 1: 共享 Kernel 与公共合同

- `rxdb.bom.watchView(input): Observable<BomViewSnapshot>` 提供数据投影；`BomRepository` 复用同名或内部代理派生查询。
- `createBomView(db, input): BomViewHandle` 共享管理 `state$`、`setInput`、`refresh`、`toggle(path)`、`loadOccurrence(id)`、`saveOccurrence(patch)`、`destroy`。函数名与职责已确定，快照节点与保存输入细项等待主会话 spike 收敛。
- `BomViewInput` 使用既有 `ResolutionContext`、`ResolveTarget`、`PlannedQuantity`、`ExpansionBudgets`，并带可选公式参数 `params`。不从全局单例推断 db，不复制解析轴。
- 未解析浏览从结构/解析 kernel 获取候选，不能以完整数量展开成功为前提；完整数量、成本与导出消费通过共享完整性检查拒绝未解析。既有 `explodeBom` 保留正常行及 manifest 的兼容语义，具体完整消费入口在 spike 中定稿。
- 首次查询可处于 loading；已有快照刷新时保留旧节点并标记 refreshing，不先清空树。迟到响应受输入代次/订阅切换控制，不能覆盖新输入。
- 路径是 occurrence ID 完整序列；展开集合只影响惰性 DOM 呈现，不要求先实现局部重算优化。相同路径在刷新前后必须保持相同 key。
- 行编辑独立加载 occurrence，允许草稿头与 draft ECN 新发生项；已发布既有发生项只读。共享层再次核对真实写入边界，框架不绕过仓储，不新增自动创建/发布 ECN 或自动替换旧行协议。

本轮没有新持久化实体，状态与投影直接定义在契约中；不增加独立的存储模型文档来复制既有实体。

## Phase 2: 薄绑定与组件

三个包通过现有 Nx 生成器与包管理器建立，沿用 `rxdb-plugin-tree-{angular,react,vue}` / search 绑定的构建、peer dependencies、测试与发布约定。实际生成器由主会话按 `nx-generate` 发现，不手写临时路径别名代替 workspace 链接。

`useBomView(db, input)` 在三端同名，输出同一组 `state/commands`；Angular signal、Vue ref、React plain snapshot 是允许的容器差异。订阅、取消、输入切换与业务错误规则来自共享 handle。React 重复挂载、Angular 销毁与 Vue scope 销毁分别验证清理；不复制业务 reducer 或域校验。

`BomTree` 以路径为 key，惰性呈现后代，展示层级、数量、截断与未解析候选；`BomLineEditor` 独立绑定编辑目标，暴露用量、组件损耗、工序、生效期及只读原因。共享视觉规则与原生有标签表单，错误关联到字段或状态区；树的方向键/Enter/Space、展开状态与焦点恢复须三端可观察一致。

ECN 创建/发布/取消不是组件能力。AC#2/#6 的 fixture 在测试中经真实 kernel 操作 ECN，使用不早于宿主 UTC 当日的固定未来日期，ECN 生效日与评估日相同。

## Project Structure

```text
specs/020-bom-slice-10/
  spec.md / plan.md / research.md / tasks.md
  contracts/bom-view-api.md

packages/rxdb-plugin-bom/src/
  view.ts / view-state.ts
  plugin.ts / repository.ts / index.ts
  quantity/explosion.ts / quantity/cost.ts
  __tests__/bom-view.spec.ts / bom-view-lifecycle.spec.ts / bom-routing.spec.ts
  testing/bom-view-fixture.ts

packages/rxdb-plugin-bom-{angular,react,vue}/
  src/use-bom-view.* / bom-tree.* / bom-line-editor.* / index.ts
  src/__tests__/*.spec.*
  README.md

apps/dev-rxdb-{angular,react,vue}/src/  # 可复用组件的同场景消费页
apps/dev-rxdb-{angular,react,vue}-e2e/src/bom-view.spec.ts
modules/e2e-parity/bom-view-parity.mjs
modules/e2e-parity/bom-view-parity.d.mts
benchmarks/bom.bench.ts
```

文件名为实施落点；Angular/React/Vue 源扩展名与导出入口遵循各包既有约定。共享文件由主会话串行接线，三端独立文件可并行编写。

## 联合验证与交付

- 共享 fixture 精确覆盖 US-522 AC#2～#12：三重边、共享子装配、ECN 改量/新增、日期、新修订、phantom、换算、四字段草稿编辑、成环错误、截断与三类候选。
- 浏览器在更新前把各可见路径对应的真实 Element 存入浏览器上下文；更新后用引用相等比较不受影响的路径。不得用截图、行数、渲染次数或相同 testid 替代 AC#2。
- 视觉对称另用相同 viewport、字体、fixture 的截图或元素几何对拍验证布局、尺寸、间距与状态；DOM 标签可不同，视觉差异需修复，不能把视觉测试当作 AC#2 的引用证明。
- 双后端验证前置与共享 kernel，三端真实组件/DOM 与完整共享场景验证绑定和视觉语义。组件加载/空/数据/错误、后台刷新、键盘与焦点独立可验。
- 更新公共 API baseline、三端 README、统一示例与发现入口；API 对称检查、四项覆盖率、五项审计、格式及当前分支 affected 由主会话统一执行。
- 基准记录预热、样本数、数据规模、运行环境、p50/p95/max；分别量查询、保存、发布/输入更新到 DOM、首屏及静态/完整 gzip。失败视为验收失败，不以缓存掩盖预算问题。
- 其他旧故事的回写只引用独立审计证据；US-510 B、US-513 B、US-519 AC#3/#7 维持价值待证，US-509 AC#13 不进入本步。

## 验证命令与执行边界

所有任务使用 `pnpm nx`，具体新增 project/target 在生成后通过工作区发现确认。主会话使用本环境统一配置 `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true`，重负载目标分段，保留本地缓存；子任务不启动 Nx，不并发重建共享 dist。

现阶段只写本目录指定五份文档。实现阶段再补有实测结果的 quickstart，不提前填写测试通过、性能或门禁完成记录。

## Complexity Tracking

无已批准原则例外。三个框架包是 US-522 的交付边界，共享层避免三份业务实现；额外通用引擎注册 API、精细失效索引或其他新抽象必须由 spike 的可复现缺口证明后再决定。
