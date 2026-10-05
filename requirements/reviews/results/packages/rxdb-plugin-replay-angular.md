---
kind: review-execution
object: rxdb-plugin-replay-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-replay-angular：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular：回放播放器挂载、资源装载和 commit 恢复交互的框架封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-replay-angular/src/replayer.component.ts`](../../../../packages/rxdb-plugin-replay-angular/src/replayer.component.ts)
- [`packages/rxdb-plugin-replay-angular/src/index.ts`](../../../../packages/rxdb-plugin-replay-angular/src/index.ts)
- [`packages/rxdb-plugin-replay-angular/package.json`](../../../../packages/rxdb-plugin-replay-angular/package.json)
- [`packages/rxdb-plugin-replay-angular/project.json`](../../../../packages/rxdb-plugin-replay-angular/project.json)

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
- [ ] C4 Angular 生命周期与注入：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
- [ ] C5 Angular 类型与运行证据：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-replay-angular` 的 15 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：5 个文件有正文片段、0 个仅测试 outline、0 个仅导航锚点、10 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                     | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 2 passed (2)；Tests 10 passed (10)                                             | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 8764–8794；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 97.72% / 93.75% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                           | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 6 个包内文件，declared entries 缺失 0；root 解析通过                                      | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `dist/packages/rxdb-plugin-replay-angular`；未执行 typed consumer/runtime import                                                                        |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

component props/signals 是输入，core mountReplayer 拥有真实播放器/restore/rrweb 生命周期；framework output 只是转发，不更新 HEAD。shared parity 通过手动触发 callback 验证事件对象身份，不能代替真实 marker 点击与恢复。React useEffectEvent 绑定最新 callback，Vue toRaw 保留 ReplayManager 私有字段的原对象身份。

### 逐 C 结论（原场景没有缩小）

#### C1 播放器挂载与按需依赖 — partial

原动作：核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。
原最低场景：空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。

**已证结论**：真实框架组件运行 shared parity：输入原样送 mountReplayer，输入变化仅 update，commands 委托，销毁调用 destroy；React 另有 StrictMode 活视图数守恒。；shared MountReplayerSpy 只观察核心边界，没有加载 rrweb 或真实 recording。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/replayer.component.ts:50–117`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/__tests__/replayer.component.spec.ts:18–60`（read-implementation）

**必要缺口 / 不能核销原因**：空 recording、加载失败、切 recording、双播放器和无后台录制的实际核心/浏览器链路尚缺。

#### C2 恢复交互与状态 — partial

原动作：跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。
原最低场景：不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。

**已证结论**：同一个 dirty_working_tree restore event 在 parity 中保持对象身份；组件仅转发核心事件，不直接更新 HEAD。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/replayer.component.ts:64–76`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/testing/replayer-parity.ts:174–184`（read-dependency-test-definition）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/__tests__/replayer.component.spec.ts:54–59`（read-implementation）

**必要缺口 / 不能核销原因**：parity 只有手动触发 restore callback；缺实际 marker 点击、不可达/dirty/并发 restore 与恢复中卸载的加载/拒绝序列。

#### C3 三端可访问性与类型 — partial

原动作：对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。
原最低场景：同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。

**已证结论**：公开 replay/sessionId/initialTime、两个输出和 play/pause/seek 已按框架 idiom 对齐；core 的事件类型及 replayRestoreHint 三端同样透传。；共用七条 parity 不是三份 demo 截图；Vue toRaw 额外保护门面原始对象。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/index.ts:10–12`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/replayer.component.ts:50–117`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/__tests__/replayer.component.spec.ts:54–59`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/testing/replayer-parity.ts:129–213`（read-dependency-test-definition）

**必要缺口 / 不能核销原因**：缺同 recording/marker 序列的真实 UI、尺寸变化、键盘与错误提示；七条边界桩 parity 不覆盖控件可访问性。

#### C4 Angular 生命周期与注入 — partial

原动作：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
原最低场景：切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。

**已证结论**：Angular 是 OnPush、afterNextRender 安装 + DestroyRef cleanup；React effect cleanup 对应 mount，useEffectEvent 更新回调；Vue onMounted/onBeforeUnmount 与 watch 按输入引用 delta update。；React StrictMode 已实际测试，不列为完全未测；但测试仅证明 mount/destroy 计数。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/replayer.component.ts:50–117`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/__tests__/replayer.component.spec.ts:63–77`（read-implementation）

**必要缺口 / 不能核销原因**：缺销毁中真实 async 完成、同组件多实例/多个 root；Angular 缺 provider/route；Vue 缺 ref/computed/getter 真实父子链路。React first layout seek 另有未跑回归。

#### C5 Angular 类型与运行证据 — partial

原动作：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。
原最低场景：typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。

**已证结论**：基线 typed source 与 lint/typecheck 通过，pack 发布入口/目标文件已在真正 tarball 核对；组件的 imperative/output 容器差异是框架表达。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/replayer.component.ts:50–117`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/index.ts:10–12`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/__tests__/replayer.component.spec.ts:1–16`（read-implementation）

**必要缺口 / 不能核销原因**：独立 typed consumer 未执行；Angular 模板负例/真实 route，React 首次 layout 命令及错误 props，Vue SFC emits/readonly/模板消费仍未完整验证。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 15 个全范围文件已登记，10 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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

## 2026-10-05 R2-10：15 文件有界收尾（最新结论）

**🟡 局部证据交付完成，整体仍 partial；完整 C 0/5，`reviewComplete=false`、`fullObjectCandidate=false`、发布就绪未验证。** 不是业务缺陷评级，不将“包门禁全绿”或“新探针已写”当原 C 全核销。15/15 全正文实读 556 行；无业务/既有测试/依赖/总台账/index 修改。

### 1. 真正已执行的包级证据

- 主控当前旧 suite：2/2 文件、10/10 tests；日志 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt` 行 870–899。Angular fixture 在 happy-dom，`mountReplayer` 是 `MountReplayerSpy`；不是 rrweb Angular 玩家端到端。
- 四指标 statements/branches/functions/lines：**97.72%（43/44） / 93.75%（15/16） / 100%（11/11） / 100%（37/37）**；阈值各项 ≥80%。只测 wrapper/index，源码/配置、缓存、测量输入、批总 exit 与包结论分离见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/validation-observations.json`。
- fresh build exit 0、lint 零警告批 exit 0。原本包 13 个门禁输入摘要与当前一致（LICENSE/README 不在该门禁输入快照但 scope 无漂移）。十包 unit 批 exit 1 不冒充整个十包全绿；本包旧套通过。
- 主控真实六文件 tarball SHA `4cd06e51c1901b617cb1aa4b26090375df94d8622e5cd43fc911a87fedfe38e6` 全部字节与当前 dist 一致；APF `types/default` 根、partial ɵcmp/standalone/required signal/output、源码 map 的 117 行 component 内容一致。root runtime import exit 0（主控明确 bootstrap Angular compiler），**不是 typed/template/route/rrweb 播放链**。详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/generated-artifacts.json`。
- 未跑新 14 例、tsc/ngc consumer 或浏览器。本代理仅只读 Nx resolved 配置、格式化新文件、语法 AST parse；语法 0/any 0/断言 0/抑制 0 不算语义编译通过。Angular list_projects 工具不可用/get_best_practices 未暴露，Nx docs HTTP500 已记录，不装工具、不阻断只读。

### 2. 原 C 的生命周期/回调/恢复/键盘职责与结论

原 C1–C5 动作和最低场景均完整保留在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/c-evidence.json`，不由本轮缩小。

| 原 C / 职责                                   | 生产锚点与已证结论                                                                                                                                                                                                                                                                                                 | 新最小 probe / 必要未验                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 mount/load/recording switch/double/destroy | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/replayer.component.ts`:69–96 单 mount/delta/DestroyRef；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts`:100–120、156–195 负责 load/empty/error/generation；wrapper 没有 start/后台录制调用 | 新 spec:120–167、198–243 对真实 Angular+core 状态链补证；受控 rrweb 不能替代真实 loader/iframe 播放链，主控 owner                                        |
| C2 marker/callback/restore state/HEAD         | wrapper:64–76 只 emits；core:232–267 marker 点击先 pause/seek、Restoring…、await 结果、generation guard、hint/output；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/restore.ts` 现取 working-tree 状态凭据                                                                                     | 新 spec:245–318 六结果 + 两个在途 restore + 卸载晚结果；dirty/unreachable/CAS 是受控决策，真实工作树验证主控 owner，不直接写 HEAD                        |
| C3 a11y/三端/键盘/尺寸                        | 三端公开输入/两个 core payload/hint/三个命令对齐；core:203–245、290–315 有原生 button/range、label/pressed/valuetext/status/live/alert；共享 focus-visible/flex 样式                                                                                                                                               | spec:169–196 与 255–278 仅属性/click/input；同 recording/marker 三端结果、resize、真实 Tab/Space/Enter/Arrow 仍主控未验，不用 demo 截图或合成事件核销    |
| C4 native Angular lifetime/injection          | afterNextRender + effect/required signals + OnPush + DestroyRef；APF standalone=true；门面显式输入，不造包内 provider API                                                                                                                                                                                          | spec:96–113/143–243/302–318：实际父子 DI 提供两份门面、同组件两实例、inputs/异步销毁/首次渲染前取消。待主控 focused + 新 spec 类型/lint，原 C 当前不核销 |
| C5 typed/template/route                       | APF 真入口声明与生成源已核；正反例公开根 import，强类型 signal/output/判别联合与命令；当前 Angular peer22.2.1                                                                                                                                                                                                      | 主控 packed strict tsc + ngc 必填输入/output/input/seek 正反模板，真实 route 挂载/卸载；TS parser 和 root import 都不能替代                              |

键盘明细（不是通过表）：loading 的 aria-busy；empty 的普通文本（不伪称 alert）；error 的 alert；Play/Pause 的 type/aria-pressed；range 的 Timeline/aria-valuetext；marker 的 Commits list 与恢复 status/aria-live；CSS focus-visible/尺寸。静态均已锚定，新增 click/input 待跑，**真实键盘、resize、AT 播报未验 owner=主控**。原生 IME 无新验证主张，未测不冒充、不无限扩所有宿主。

### 3. 已冻结的必要交付与主控后补

- 新 spec `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/__tests__/review-round2-player-lifecycle.spec.ts`：14 个原职责场景，SHA `ccb0f574dfd4dafd22cb185518a1b537422670700161e5f16e013763f5dc33b8`。`mountReplayer` 不 mock；仅控制 ReplayManager/rrweb。冻结后不继续加场景，不改原 tests。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/consumer-valid.mts` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/consumer-invalid.mts`：正例含真实消费模板和命令/事件；负例 8 个 TS 诊断表达式，加错输入/输出/命令/缺必填模板。独立环境无 workspace paths/links、无 any/类型断言/ts-expect-error；strict、skipLibCheck=false。
- **额外要求**：`types: ["node"]` 与安装 `@types/node` / `@types/ms`；裸上游 utils NodeJS/ms 错误 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation-bare.json` 不删除、不 stub、不用 skipLibCheck 藏错。本对象最新已观察 typed 行仍是 fixture-not-yet-written，主控已看到正例并将更新对照，不伪称消费者已失败/通过。
- 六项最小请求 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/validation-requests.json`：packed tsc、ngc、focused spec、lint、spec typecheck、原 C 内浏览器/route/三端同序列/恢复决策。均 owner=controller；不等待全部73或无限扩大 core rrweb 录制库宿主。
- 新本对象问题 0；`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/RV-070-parallel-react-replayer-layout-seek.md` 仅 React 首次 layout seek 既有缺陷引用，不修改、不泛化 Angular/Vue。

### 4. 原完成条件与最终边界

| 条件                        | 最新判定                                                                         |
| --------------------------- | -------------------------------------------------------------------------------- |
| F1 全受控清点/阅读/构建来源 | met：15/15、556 行，scope 无漂移，APF/map/实际 tar 追溯；历史 10 未读已关闭      |
| F2 每 C 明确结论/原因/动作  | met-for-reporting：5 个原 C 均有场景结论/锚点/owner；不等于完整 C                |
| F3 不变量与动态测量分离     | met-for-reported-evidence：旧 spy gate、真实源、未执行 probe、原生浏览器严格分层 |
| F4 当轮门禁/缓存/skip/覆盖  | partial：已读主控旧完整测量；新 focused/类型/lint/consumer 待主控，不能继承旧绿  |
| F5 上游/三端/真实消费链     | partial：静态 API/核心所有权对照已完，原真实场景仍必要未验                       |
| F6 去重/归属/禁止假绿       | met-with-no-new-own-findings：无新候选；utils 上游、RV070 React 归属明确         |
| F7 整体评级/评审与发布分离  | partial：当前🟡证据未全；有界交付完成，原完整对象/发布就绪不核销                 |

机器闭环 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/closure.json`，全部本任务改动绝对清单 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/changed-files.json`。主控后补匹配冻结 SHA 的真实结果后再裁定完整 C；本交付不等无关大环境。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。


## R3-03：Replay Angular 夹具 / mock / 缓存因果补证（2026-10-05 冻结）

**源码阅读及逐 C 意见交付：完成（按主控十包 153 文件统计）；本专题证据：partial-frozen；发布验证：独立 pending。** 不因平台/验证红灯把已完成评审一律算成未评审。按最新用户要求冻结，不再扩 rrweb 或测试矩阵。

本轮仅改新增 R2 spec 夹具，不改生产代码/依赖/既有 spec/配置；接手旧源 SHA `47478ce39514355ef208742835603a1e6ef1296eabb499290ef83ceb54edc6fd`、失败日志和输入 SHA 留存。[完整有界说明](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/README.md)、[执行清单](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/executions.json)、[闭环与归属](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/closure.json)。

| 对照 | 真实结果 | exit | 结论 |
| --- | --- | --- | --- |
| 接手旧组件单文件 | 9/9 pass | 0 | 历史旧套 10/10 含另一 release-config 用例，不能冒充单文件 10 条 |
| 接手原 R2 独立 | 3 pass / 11 fail，21 个未处理错误 | 1 | rrweb 边界没命中；不登记产品 bug |
| 接手原 R2 + 旧组件，不隔离 | 3 pass / 20 fail | 1 | 旧 spy 输入被缓存真实 core 带红，属夹具/cache 对照 |
| 中间最小有效夹具独立 / 合跑 | 15/15、24/24 pass | 0 / 0 | 独立组件模块键 + 真 core 源函数转发 + 可解析 rrweb 边界，旧 9 条恢复 |
| 最终冻结独立 | 18 pass / 1 fail（19） | 1 | 唯一红为全局 RAF 队列残 1 条，未归属 pending |
| 同最终 SHA 合跑、不隔离 | 27 pass / 1 fail（28），旧文件 9/9 | 1 | 同一 RAF 断言红，旧 spec 未再被污染 |

最终 spec SHA `aa62d9cf16d8c66c49e7a5a9f126c8c222915fe499de22051b87c8146efb06fd`；独立和合跑 raw/status/inputSHA 一致追溯：[独立](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/28-final-independent/20261005T153621267684.txt)、[合跑](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/29-frozen-minimal-pair/20261005T153739704095.txt)。新确认产品问题 0、新产品风险候选 0；不把 pending 红包装成缺陷，也不把 exit 1 写成全绿。

有效产品边界：真实 Angular + core 的四态、不启动 recording、挂载后 pending seek/initialTime、夹紧与 rrweb +1 偏移、控制/finish 输出、replay/session 输入更新与代际取消、销毁一次及晚 load/restore 不输出。恢复成功/四拒绝/错误及双 pending restore 只是受控转发，不证明真实 working-tree CAS。父子 provider 仅证明分轮加载、同时存活；同轮 loader 漏出真实 rrweb 的中间失败及真实 iframe/浏览器链未核销。最终 RAF Map 拦截全局 requestAnimationFrame，未证明余帧属于 Replay core；该断言红冻结交主控判归属，不删断言、不 skip。

严格 tar consumer 只读：strict=true、skipLibCheck=false、skipDefaultLibCheck=false；15 个 rrdom/rrweb 声明诊断原样保留（TS2663×6、TS1254×6、TS2395×3）。另 TS6059 是 runner rootDir 错设引出的探针错误；spec 双 DOM/WebWorker lib 冲突也不计产品错误。修正 helper 未再执行，最终严格类型/lint/覆盖/真实平台发布验证仍 pending；不继承旧绿、不用 skipLibCheck 掩盖。152 个 consumer 输入 hash 无漂移，未改消费包/工具/他人用例。

真实执行：共享锁下 29 个 Nx 命令＝21 次聚焦测试＋2 次严格类型 probe＋6 次 discovery/help；总 exit 0×9、exit 1×20。Vitest 报告 385 case 执行（含重复/hook 失败）＝247 pass＋138 fail＋0 skip，不能按独特场景或全对象覆盖计。未执行大 build、全套、GUI 或 Git 写操作。
