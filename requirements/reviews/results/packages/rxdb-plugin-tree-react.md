---
kind: review-execution
object: rxdb-plugin-tree-react
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-tree-react：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

React：Tree repository 的响应式查询与加载状态封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-tree-react/src/use-tree.ts`](../../../../packages/rxdb-plugin-tree-react/src/use-tree.ts)
- [`packages/rxdb-plugin-tree-react/src/index.ts`](../../../../packages/rxdb-plugin-tree-react/src/index.ts)
- [`packages/rxdb-plugin-tree-react/package.json`](../../../../packages/rxdb-plugin-tree-react/package.json)
- [`packages/rxdb-plugin-tree-react/project.json`](../../../../packages/rxdb-plugin-tree-react/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 树查询与输入类型：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。
- [ ] C2 增量结果与参数切换：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。
- [ ] C3 三端 contract 与泄漏：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。
- [ ] C4 React 生命周期与竞态：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
- [ ] C5 React 类型与 render 边界：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-tree-react` 的 13 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：5 个文件有正文片段、0 个仅测试 outline、0 个仅导航锚点、8 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                 | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 3 passed (3)；Tests 6 passed (6)                                           | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 9192–9221；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 100% / 100% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 10 个包内文件，declared entries 缺失 0；root 解析通过                                 | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `packages/rxdb-plugin-tree-react`；未执行 typed consumer/runtime import                                                                                 |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

四个函数只挑静态仓储方法名与默认值，没有第二套 query 状态机。生命周期和错误归属对应 rxdb framework useRepositoryQuery；Tree 插件拥有层级/QueryCache/移动语义。当前 fixture 是手写 TreeEntity/static method mock，不是深树 SQL 或 numeric-id consumer。

### 逐 C 结论（原场景没有缩小）

#### C1 树查询与输入类型 — partial

原动作：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。
原最低场景：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。

**已证结论**：四个入口逐个对齐方法名/defaultValue（数组 []、计数 0）与 EntityStaticType 参数；只委托本框架 useRepositoryQuery，不存在扁平查询 fallback。；泛型 fixture 有 PlainEntity 编译期拒绝及树实体接受，但 id 实际都是 string，不能拿它证明 numeric id。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts:23–81`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/use-tree.spec.ts:81–128`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/tri-framework-generics.spec.ts:21–77`（read-implementation）

**必要缺口 / 不能核销原因**：缺 numeric id 实际查询、无 Tree 插件、QueryCache 禁止组合及深树真实仓储链路；四个同名 mock method 不能替代这些原场景。

#### C2 增量结果与参数切换 — partial

原动作：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。
原最低场景：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。

**已证结论**：wrapper 没有自己的 query state/订阅；订阅切换和错误全部由已读 useRepositoryQuery 承担，React/Vue 有代次屏障，Angular effect cleanup 释放旧订阅。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts:71–159`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/use-tree.spec.ts:99–127`（read-implementation）

**必要缺口 / 不能核销原因**：没有在树 wrapper 上运行跨父移动、父删除、快速改 query、空树与销毁同 fixture；状态模型源码相同不等于真实树增量结果已复验。

#### C3 三端 contract 与泄漏 — partial

原动作：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。
原最低场景：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。

**已证结论**：三端四个运行时根导出、输入泛型/资源返回结构一致，类型参数均收紧为 TreeEntityType；计数默认值已动态断言。；已实际读取三端 README 的调用形式、原生成/控制来源是 scope 中的手写 class fixture，不是后台生成的 consumer。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/index.ts:15–15`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/tri-framework-generics.spec.ts:21–77`（read-implementation）

**必要缺口 / 不能核销原因**：缺同一真实 tree fixture 的三端状态/多实例泄漏对照及独立 typed consumer；pack root resolve 不证明声明可消费。

#### C4 React 生命周期与竞态 — partial

原动作：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
原最低场景：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。

**已证结论**：已追溯到框架核心的 cleanup/代次实现，不在 thin wrapper 另建订阅。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts:71–159`（read-implementation）

**必要缺口 / 不能核销原因**：Angular 缺真实组件 input/provider override/route；React wrapper 套件没有 StrictMode 与多 root；Vue 套件仅 effectScope，没有真实 SFC props 深改/挂卸/晚到组合。

#### C5 React 类型与 render 边界 — partial

原动作：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。
原最低场景：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。

**已证结论**：现有 workspace typecheck 编译正反泛型 fixture，基线 lint 无警告；没有因为 inject/use 命名差异误报。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/tri-framework-generics.spec.ts:21–77`（read-test-definition）

**必要缺口 / 不能核销原因**：现有 fixture 不是独立声明 consumer；Angular 模板错误/route、React 同值新引用和错误 props 渲染、Vue vue-tsc/readonly/SFC pack 消费不能由 root resolve 和类型 fixture 自动补齐。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 13 个全范围文件已登记，8 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
2. **逐 C 明确结论与原场景登记：通过；原完整 C 核销：未完成。** 每条保留原动作/场景和局部证据，缺必要验证不是完成。
3. **源码不变量 / 动态主张分离：通过（已登记范围）。** read-implementation 与 navigation-only 标注分离；新增探针不引用预期红当实际失败。
4. **当轮门禁、缓存、skip、四指标：基线已登记。** 当前报告原测量面不变；晚加 spec 没有被老 baseline 自动覆盖。
5. **上游 / 三端 / 消费链路：partial。** 已作公开根入口、类型/容器、delegation/所有权局部对照；pack 不等于独立 typed/runtime consumer，完整 UI 链路见各 C 缺口。
6. **问题去重 / 正式结论：partial。** 仅 React working-tree/provider 和 replay/early-seek 两个候选在 findings.pending.md 待主控复验/去重编号；不生成 RV，不扩新问题。
7. **全对象评级与完成：不核销。** 没有把“后续可审”“测试很多”“100% thin wrapper coverage”当作完成；评审完成不要求零缺陷，但仍要求原场景/全范围有证据。

### 交付附件

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/c-evidence.json`：原场景、结论、源码/测试角色、具体缺口。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`：完整受控 inventory、真实正文/outline/导航的区别与摘要。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/validation-observations.json`：已读取的主控测量与 pack 消费来源。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/findings.pending.md`：只保留两个候选及 Angular 门禁边界。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/validation-requests.json`：已请求的 late spec focused 验证；本交付不等待更大队列。
