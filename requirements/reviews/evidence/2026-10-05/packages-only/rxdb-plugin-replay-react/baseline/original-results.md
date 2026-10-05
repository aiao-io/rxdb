---
kind: review-execution
object: rxdb-plugin-replay-react
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-replay-react：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

React：回放播放器挂载、资源装载和 commit 恢复交互的框架封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-replay-react/src/replayer.tsx`](../../../../packages/rxdb-plugin-replay-react/src/replayer.tsx)
- [`packages/rxdb-plugin-replay-react/src/index.ts`](../../../../packages/rxdb-plugin-replay-react/src/index.ts)
- [`packages/rxdb-plugin-replay-react/package.json`](../../../../packages/rxdb-plugin-replay-react/package.json)
- [`packages/rxdb-plugin-replay-react/project.json`](../../../../packages/rxdb-plugin-replay-react/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 播放器挂载与按需依赖：核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。
- [ ] C2 恢复交互与状态：跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。
- [ ] C3 三端可访问性与类型：对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。
- [ ] C4 React 生命周期与竞态：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
- [ ] C5 React 类型与 render 边界：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-replay-react` 的 11 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：5 个文件有正文片段、0 个仅测试 outline、0 个仅导航锚点、6 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                 | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 1 passed (1)；Tests 10 passed (10)                                         | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 9253–9298；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 96% / 87.5% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 10 个包内文件，declared entries 缺失 0；root 解析通过                                 | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `packages/rxdb-plugin-replay-react`；未执行 typed consumer/runtime import                                                                               |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

component props/signals 是输入，core mountReplayer 拥有真实播放器/restore/rrweb 生命周期；framework output 只是转发，不更新 HEAD。shared parity 通过手动触发 callback 验证事件对象身份，不能代替真实 marker 点击与恢复。React useEffectEvent 绑定最新 callback，Vue toRaw 保留 ReplayManager 私有字段的原对象身份。

### 逐 C 结论（原场景没有缩小）

#### C1 播放器挂载与按需依赖 — partial

原动作：核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。
原最低场景：空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。

**已证结论**：真实框架组件运行 shared parity：输入原样送 mountReplayer，输入变化仅 update，commands 委托，销毁调用 destroy；React 另有 StrictMode 活视图数守恒。；shared MountReplayerSpy 只观察核心边界，没有加载 rrweb 或真实 recording。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:50–102`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:19–58`（read-implementation）

**必要缺口 / 不能核销原因**：空 recording、加载失败、切 recording、双播放器和无后台录制的实际核心/浏览器链路尚缺；React early-seek 候选待主控复验。

#### C2 恢复交互与状态 — partial

原动作：跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。
原最低场景：不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。

**已证结论**：同一个 dirty_working_tree restore event 在 parity 中保持对象身份；组件仅转发核心事件，不直接更新 HEAD。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:58–70`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/testing/replayer-parity.ts:174–184`（read-dependency-test-definition）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:52–57`（read-implementation）

**必要缺口 / 不能核销原因**：parity 只有手动触发 restore callback；缺实际 marker 点击、不可达/dirty/并发 restore 与恢复中卸载的加载/拒绝序列。

#### C3 三端可访问性与类型 — partial

原动作：对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。
原最低场景：同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。

**已证结论**：公开 replay/sessionId/initialTime、两个输出和 play/pause/seek 已按框架 idiom 对齐；core 的事件类型及 replayRestoreHint 三端同样透传。；共用七条 parity 不是三份 demo 截图；Vue toRaw 额外保护门面原始对象。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/index.ts:10–12`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:50–102`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:52–57`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/testing/replayer-parity.ts:129–213`（read-dependency-test-definition）

**必要缺口 / 不能核销原因**：缺同 recording/marker 序列的真实 UI、尺寸变化、键盘与错误提示；七条边界桩 parity 不覆盖控件可访问性。

#### C4 React 生命周期与竞态 — partial

原动作：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
原最低场景：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。

**已证结论**：Angular 是 OnPush、afterNextRender 安装 + DestroyRef cleanup；React effect cleanup 对应 mount，useEffectEvent 更新回调；Vue onMounted/onBeforeUnmount 与 watch 按输入引用 delta update。；React StrictMode 已实际测试，不列为完全未测；但测试仅证明 mount/destroy 计数。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:50–102`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:61–87`（read-implementation）

**必要缺口 / 不能核销原因**：缺销毁中真实 async 完成、同组件多实例/多个 root；Angular 缺 provider/route；Vue 缺 ref/computed/getter 真实父子链路。React first layout seek 另有未跑回归。

#### C5 React 类型与 render 边界 — partial

原动作：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。
原最低场景：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。

**已证结论**：基线 typed source 与 lint/typecheck 通过，pack 发布入口/目标文件已在真正 tarball 核对；组件的 imperative/output 容器差异是框架表达。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:50–102`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/index.ts:10–12`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:1–16`（read-implementation）

**必要缺口 / 不能核销原因**：独立 typed consumer 未执行；Angular 模板负例/真实 route，React 首次 layout 命令及错误 props，Vue SFC emits/readonly/模板消费仍未完整验证。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 11 个全范围文件已登记，6 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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
