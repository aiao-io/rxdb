---
kind: review-execution
object: rxdb-react
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-react：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

React：核心查询资源、provider、状态/action/同步与无限滚动的框架封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`packages/rxdb-react/src/hooks.ts`](../../../../packages/rxdb-react/src/hooks.ts)
- [`packages/rxdb-react/src/rxdb-react.tsx`](../../../../packages/rxdb-react/src/rxdb-react.tsx)
- [`packages/rxdb-react/src/use-action.ts`](../../../../packages/rxdb-react/src/use-action.ts)
- [`packages/rxdb-react/src/useInfiniteScroll.ts`](../../../../packages/rxdb-react/src/useInfiniteScroll.ts)
- [`packages/rxdb-react/src/use-sync-state.ts`](../../../../packages/rxdb-react/src/use-sync-state.ts)
- [`packages/rxdb-react/package.json`](../../../../packages/rxdb-react/package.json)
- [`packages/rxdb-react/project.json`](../../../../packages/rxdb-react/project.json)
- [`packages/rxdb-react/src/index.ts`](../../../../packages/rxdb-react/src/index.ts)

| target         | 当前证据                      | 日志                                                            |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| `lint`         | 本轮通过（限定当前配置/平台） | 执行日志         |
| `typecheck`    | 本轮通过（限定当前配置/平台） | 执行日志    |
| `test`         | 本轮通过（限定当前配置/平台） | 执行日志         |
| `build`        | 本轮通过（限定当前配置/平台） | 执行日志        |
| `test-browser` | 本轮通过（限定当前配置/平台） | 执行日志 |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 查询资源状态机：逐个公开 useGet/useFind/useFindOne 等入口核对 value/error/isLoading/isEmpty/hasValue、默认值与查询键切换；与核心 repository 事件对照。
- [ ] C2 写操作、实体与同步：追踪 action 防重入、entity change、sync state/persisted state 到核心实现；错误不只 console 输出。
- [ ] C3 无限滚动与类型对称：核查分页边界、并发 loadMore、滚动 observer 清理和实体泛型；使用同一 shared fixtures 对照另外两端。
- [ ] C4 React 生命周期与竞态：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
- [ ] C5 React 类型与 render 边界：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- 核心四指标 ≥90%。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-react` 的 33 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：7 个文件有正文片段、0 个仅测试 outline、1 个仅导航锚点、25 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                       | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 14 passed (14)；Tests 204 passed (204)                                           | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 790–845；新增 review-parallel 不在此基线                                                                                                                        |
| 四项覆盖率               | statements / branches / functions / lines = 99.35% / 96.29% / 98.93% / 100%；要求各项 ≥ 90% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                             | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 31 个包内文件，declared entries 缺失 0；root 解析通过                                       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `packages/rxdb-react`；未执行 typed consumer/runtime import                                                                                             |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

查询五状态、provider 借用/owned lease、sync/persist/action 的局部实现已读；分页和大量测试未完整阅读，不能以全包 coverage 承诺游标/真实 route/StrictMode 全场景。

### 逐 C 结论（原场景没有缩小）

#### C1 查询资源状态机 — partial

原动作：逐个公开 useGet/useFind/useFindOne 等入口核对 value/error/isLoading/isEmpty/hasValue、默认值与查询键切换；与核心 repository 事件对照。
原最低场景：首次加载、空结果、失败后重试、参数快速变化、过期响应；五项资源状态三端一致。

**已证结论**：五项资源状态、空值判断和 errors 转 Error 已读；Angular lazy signal、React layout 代次 + passive 订阅、Vue options key watch + scope invalidation 已逐段追溯。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts:71–159`（read-implementation）

**必要缺口 / 不能核销原因**：尚未人工逐个公开查询入口与所有原场景映射；快速参数变化/失败重试/晚到真实仓储还缺完整三端共同 fixture。React browser target 不在普通基线 test 中执行。

#### C2 写操作、实体与同步 — partial

原动作：追踪 action 防重入、entity change、sync state/persisted state 到核心实现；错误不只 console 输出。
原最低场景：连续点击、写入拒绝、换库、离线重连、组件销毁；错误/返回值按既有 API 传达。

**已证结论**：三端 action 计数追踪所有并发 promise、finally 归还计数，错误原样 reject，不把 isPending 当实际防重入锁。；syncState 归属 core；persistError 有公开状态，registry 所有权不同（Angular root DI，React/Vue module registry）。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/use-action.ts:56–78`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/use-sync-state.ts:49–62`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/use-persisted-state.ts:90–98`（read-implementation）

**必要缺口 / 不能核销原因**：连续点击/写入拒绝/换库/离线重连/销毁的完整链路未逐项映射；Angular directive 当前 16 个 fixture/mock 边界失败，不归因生产实现。

#### C3 无限滚动与类型对称 — partial

原动作：核查分页边界、并发 loadMore、滚动 observer 清理和实体泛型；使用同一 shared fixtures 对照另外两端。
原最低场景：末页、排序同值、可空列、删除/更新跨页、多个列表；不重复加载或丢行，consumer 类型保真。

**已证结论**：未形成通过结论；只登记当前入口，不声称实现或测试已完整评审。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/useInfiniteScroll.ts:83–83`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：分页实现和其大量测试未深读；末页、同值排序、NULL、跨页删除/更新与多列表的原场景全部不能因 unit/coverage 绿自动核销。

#### C4 React 生命周期与竞态 — partial

原动作：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
原最低场景：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。

**已证结论**：provider owned/source 生命周期已追踪：直接实例借用，promise/factory 按 scope 销毁；React lease 的 microtask 避开 StrictMode 探测性 cleanup；Vue disposed 后晚到 owned instance 销毁。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/rxdb-react.tsx:129–248`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts:71–159`（read-implementation）

**必要缺口 / 不能核销原因**：真实多个 root/provider override/route/输入快速切换未逐项映射；React browser 现有 target 尚待主控；Angular 基线失败需先查 mock/Analog 编译后的 import 边界。

#### C5 React 类型与 render 边界 — partial

原动作：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。
原最低场景：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。

**已证结论**：本轮 workspace 类型/零警告门禁及真正 tarball root resolve 已实读，不引用旧日期全仓日志。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts:71–159`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/rxdb-react.tsx:129–248`（read-implementation）

**必要缺口 / 不能核销原因**：本对象所有受控源码/测试未读完；独立 typed consumer/runtime import/模板/SFC 的真实消费链路不在 pack 证据范围。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 33 个全范围文件已登记，25 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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
