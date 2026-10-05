---
kind: review-execution
object: rxdb-plugin-replay-react
source_root: packages/rxdb-plugin-replay-react
created: 2026-10-03
updated: 2026-10-05
worker: PKG-replay-react
execution: complete-original-scope
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: remaining-owners-listed
release-validation: not-performed-this-pass
rating: "🟡"
---

# rxdb-plugin-replay-react：全文评审与逐 C 意见

**🟡 凑合。源码全文评审 / 评估意见交付：complete-original-scope。** 不是“没有新 bug 所以绿”：既有 **RV-070 / P2 / Open** 仍使首次 layout 阶段的 `seek` 违背公开契约。薄封装的有限测量不能替代核心 Replay、rrweb、恢复权限与真实 UI 验收。未发现本包新的 P0/P1 或足以判红的系统性失控；不将证据缺口伪装成确认故障。

- 完整阅读：**12/12 文件，545/545 行**，所有源码、config、test、README 与 LICENSE 均含在内。
- 原意见：**C1–C5，5/5 交付**；不是 5/5 原专项场景运行通过。
- 去重结果：**1 个既有确认问题 RV-070，0 新增确认，0 待复验候选**。
- 原业务、原测试、依赖与 index 不修改，不自行执行 Git 操作；不派 agent，不带第二包；仅本包评审文档/evidence 及指定进度脚本。
- 专项验收 / 发布验收：未完成，owner、场景和原因在 §6；**releaseReady=false**。

## 1. 阅读范围、基线及历史保留

对象根 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react`；scope 记载 `943c50cc85b4be3b0635f736a35a9659c3fe209a`。本次以逐文件当前 SHA 判定阅读对象，12 文件全部与已给冻结 scope 一致。正文四批无截断，旧 plan/results 分片全文读完；历史大指纹清单的无关输出截断不充当全文证据，相关六键已单独补取。

- [冻结 scope](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/scope.json) / [冻结 resolved](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/resolved-project.json) / [冻结核对](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/scope-freeze.json)。
- [12 文件 SHA/行数/真实全文区间/具体关注及 C 归属](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/file-inspection.json)。
- [原 plan 全文](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/baseline/original-plan.md) / [原 results 全文](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/baseline/original-results.md)，保留旧 11 文件/partial/0 个完整专项的历史原语境；本次新增第 12 个受控 layout 探针全文阅读，不继续沿用旧“未读6文件”。
- [支撑性依赖阅读](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/dependency-inspection.json)：core contract/lifecycle/restore 的真实区间、完整 spy/parity 定义、三端根导出及继承 TS 配置的指定区间。**不是另外两框架或核心包的全文交付。**

## 2. 问题去重：RV-070 保留 Open，不再新报

既有记录：RV-070：React 播放器首次 layout effect 的 seek 被丢弃，P2。责任角色：**React Replay 维护者**。

**源码与公开承诺**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:23–24`、`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/README.md:65`：加载完成前 seek 应记住目标。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:91–99`：公开 imperative ref 在 layout 阶段可被父组件调用，但 `seek` 只做 `handleRef.current?.seek(timeMs)`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:62–78`：core handle 到 passive mount effect 才赋值；中间窗口没有保存 seek 意图。
- 核心 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:143–148` 的 pending position 只在收到调用后才有作用，不能修复 wrapper 根本没发出的 seek。

**同 hash 证据复用而非本轮重跑**：实际既有日志显示该探针 **1 test failed：expected `[[500]]`，received `[]`**。当前实现、layout 探针、普通 spec、vite 配置、包 manifest 及核心 spy 定义六个关键输入均与当时指纹相同。完整工具链没有全量锁证，不将此写成 fresh 环境重新运行。

- 失败原日志：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/new-parallel-probes.txt:710–751`，命令当时单worker且跳过远端/本地缓存。
- 本包摘录：[rv070-log-excerpt.txt](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/rv070-log-excerpt.txt)；指纹与复用限制：[reused-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/reused-evidence.json)。
- 复现定义：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/review-parallel-layout-seek.spec.ts:17–29`；**真实 React layout/passive 时序，MountReplayerSpy 核心边界观测**，不是 rrweb/真实 iframe 时间轴执行。

**最小改进方向**：无 handle 期间只保存最后一次 seek，在本次 handle 建立后交付，或验证过后调整挂载阶段；加载前 play/pause 仍为空操作，不能为全部命令新增队列/兜底。修复必须覆盖 StrictMode、SSR/hydration、卸载、多 root 与 latest-seek。已存在的红测试不删、不 skip、不重复造另一个 RV。本轮只交付评审，不实施修复。

## 3. 受控 stub、核心与 React 的证据分层

| 层 | 确实已读 / 历史测到 | 不能据此推出 |
| --- | --- | --- |
| React wrapper | 真组件、happy-dom、React effects/ref；StrictMode 的活句柄计数、最新 time 回调、replay 身份 update；layout 探针证实丢命令 | 真实 browser、SSR/hydration、多 root、实际异步取消全部通过 |
| MountReplayerSpy / shared parity | 同步记录 host/options/update/play/pause/seek/destroy；手工注入 time 与同一个 dirty_working_tree restore event | core.readEvents/restoreToCommit 被调用、真实脏工作树拒绝、真实恢复 UI 已测 |
| core Replay/rrweb | 源码可见加载使用readEvents/listCommitMarkers + import(rrweb)、generation失效、restoreToCommit归属与错误转结果 | 本轮已跑真实核心、真实iframe、权限/并发恢复场景 |
| 根入口 / 发布 | 五公开符号与 API baseline 一致，三端共享事件/提示函数相同；历史pack含10文件 | 当前独立strict TS consumer或ESM runtime import已通过 |

精确边界：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:14–17` 整体 mock 核心 mount；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/testing/replayer-parity.ts:50–76` 只有同步记账、`:174–184` 恢复事件手工构造。空对象经类型断言仅是隔离 stub 的输入，不能算真实 ReplayManager。

## 4. 原 C 逐项结论（原动作与场景保留）

### C1 播放器挂载与按需依赖 — 原源码意见已交付

**原动作**：核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。
**原最低场景**：空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。

**结论**：确认既有RV-070；其余wrapper委托在源码/已读stub测试边界成立。
没有record/start/HEAD操作；host只交给core。核心加载/空会话/取消不是wrapper负责的状态机。RV-070是React首次layout尚无core handle的额外窗口，不是rrweb已建句柄的pending seek缺陷。

**本包源码锚点**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:28-35`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:62-89`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:91-102`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/README.md:56-67`

**测试定义锚点（不冒充本轮运行）**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:14-58`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/review-parallel-layout-seek.spec.ts:17-29`

**未验归属**：SV-01, SV-04，场景/责任角色/原因详见 §6。

### C2 恢复交互与状态 — 原源码意见已交付

**原动作**：跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。
**原最低场景**：不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。

**结论**：源码层通过：只转发事件，无HEAD写入；真实恢复场景未测。
事件类型来自core，onCommitRestore不修改结果、commit或HEAD。shared parity的dirty_working_tree值是手工构造，不是调用restoreToCommit产生。

**本包源码锚点**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:18-20`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:59-70`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/README.md:23-25`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/README.md:41-50`

**测试定义锚点（不冒充本轮运行）**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:25-28`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:52-57`

**未验归属**：SV-02，场景/责任角色/原因详见 §6。

### C3 三端可访问性与类型 — 原源码意见已交付

**原动作**：对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。
**原最低场景**：同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。

**结论**：入口/共享类型与React adapter契约已对照；真实三端UI和可访问性未测。
同一核心事件类型和提示函数三端透传；Ref/Component/expose的原生命名差异不是缺API。组件自己只渲染宿主div，控件、尺寸与键盘属于core视图，不能由七条spy parity或100% lines推导。

**本包源码锚点**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/index.ts:1-12`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:9-26`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:101-102`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/README.md:58-69`

**测试定义锚点（不冒充本轮运行）**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:19-58`

**未验归属**：SV-03，场景/责任角色/原因详见 §6。

### C4 React 生命周期与竞态 — 原源码意见已交付

**原动作**：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
**原最低场景**：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。

**结论**：确认RV-070时序缺陷；cleanup/refs/最新time回调在有限测试范围成立。
每实例独立host/handle/applied refs，effect按mount-cleanup配对；无Provider/context逻辑，本包provider隔离不适用。StrictMode spy计数与callback换新已有历史运行，不列为完全未测；async generation由core承担，多root与真实晚到结果另记owner。

**本包源码锚点**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:54-60`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:62-99`

**测试定义锚点（不冒充本轮运行）**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:61-98`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/review-parallel-layout-seek.spec.ts:17-29`

**未验归属**：SV-01, SV-04, SV-05，场景/责任角色/原因详见 §6。

### C5 React 类型与 render 边界 — 原源码意见已交付

**原动作**：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。
**原最低场景**：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。

**结论**：公开声明/输入diff/render纯度已审；加载前seek文档契约由RV-070证实违背，独立消费仍未验证。
props非泛型但索引引用core类型，Ref仅Pick三个命令；render返回div，不发起I/O。callbacks不入mount依赖，通过Effect Event转最新props；新身份replay按公开语义update不是无意义重挂载。无any/ts-ignore/disable-hooks或吞恢复异常的新增手段；spec的空门面断言仅供受控stub。

**本包源码锚点**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:9-35`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:50-102`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/index.ts:10-12`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/package.json:23-46`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/tsconfig.lib.json:11-33`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/tsconfig.spec.json:10-27`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/vite.config.mts:29-62`

**测试定义锚点（不冒充本轮运行）**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx:75-98`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/review-parallel-layout-seek.spec.ts:23-29`

**未验归属**：SV-04, SV-05, REL-01，场景/责任角色/原因详见 §6。

## 5. 测试、配置与历史动态证据

**本轮新增动态执行：0。** 没有新的重要源码疑点，不为“凑绿”跑完整测试、build 或发布消费矩阵。下面只读历史证据；不是本轮新运行。

| 项目 | 读取事实 | 结论限制 |
| --- | --- | --- |
| 历史正常单测 | 2026-10-05 09:06，replayer.spec.tsx：1 文件 / 10 tests passed | 7条shared parity + 3条React局部；该批还不含后来layout探针 |
| 历史四指标 | statements **96% (48/50)**，branches **87.5% (14/16)**，functions **100% (14/14)**，lines **100% (41/41)**；summary skipped=0 | 四项均满足该包80%门槛，但不是核心Replay/rrweb覆盖率，也不证明当前suite全绿 |
| layout 探针 | 同关键输入历史1 test failed，expected [[500]]、actual [] | RV-070仍Open；不能由10个旧绿测试抵消 |
| 历史 pack | 10文件含dist入口/声明、两个生产src、LICENSE/README/manifest，无spec | 没有本轮build/pack/独立typed/runtime消费 |
| 历史 lint/typecheck | 原results已登记通过，本次保留历史语境 | 本轮没有新运行；新probe的compiler.txt仅命令，无exitCode，不从空日志推导类型通过 |

正常单测/四指标原文：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt:9253–9280`；本包 [摘录](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/historical-unit-coverage-excerpt.txt)。实际summary与pack来源、指纹、读取范围见 [reused-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/reused-evidence.json)。

**配置完整阅读后的限制**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/vite.config.mts:48–62`：环境是 happy-dom，非真实 browser project；include **包含两个 spec**，没有排除现存红探针。coverage 默认 v8/include src。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/vite.config.mts:29–46`：ES library、dts、core/react/JSX外置；`:18–27` 是CI/token条件上传，故不执行不必要build。`:43–44` 既有 pluginTimings:false 仅为构建耗时诊断，不能当ESLint零警告证据，本轮未改。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/package.json:44–46`：当前 core peer `*`，React peer `^19.3.0`；旧plan里的 `^19.2.8` 已过时。不猜测发布兼容矩阵已绿。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/tsconfig.lib.json:11–33` 排除spec/test而生成生产声明；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/tsconfig.spec.json:10–27` 包含ts/tsx测试及vite配置，不把lib通过当spec也通过。
- `/Users/jimmy/Documents/aiao/rxdb/tsconfig.base.json:118–123` 的继承事实为 strict:true，**既有** skipLibCheck/skipDefaultLibCheck:true；本轮没有修改/降低选项，也不声称已在不跳过库检查的独立strict消费工程通过。
- 冻结resolved明确typecheck依赖build/^typecheck、test依赖^build；只复用已有针对性证据，不触发多包依赖矩阵。

## 6. 未验专项与发布验收（owner / 场景 / 原因）

以下 owner 为责任角色，实名由主控指定；本轮没有向其他 agent 派单。未验不等于缺陷确认，不堵塞本包原范围源码意见交付。

| ID / C | owner | 场景 | 原因 |
| --- | --- | --- | --- |
| SV-01 / C1, C4 | 核心Replay/rrweb视图维护者；React Replay维护者协作 | 空recording、readEvents/listCommitMarkers/rrweb加载失败、切session/replay、双播放器、卸载后的旧加载与无后台录制 | 本包tests把mountReplayer整体替换为同步spy；这里只能证明输入/update/destroy委托，不能证明真实读取、rrweb加载和异步取消。按用户要求不重复追真实iframe。 |
| SV-02 / C2 | 核心Replay与working-tree恢复维护者；React Replay维护者协作 | 真实marker点击、不可达commit、dirty tree、并发恢复、恢复中卸载及loading/拒绝/错误提示 | 共享parity手工注入dirty_working_tree事件，仅验证同对象转发；core.restoreToCommit与UI实际交互未在本轮执行。 |
| SV-03 / C3 | 核心播放器UI维护者与Angular/React/Vue可访问性QA | 同recording/marker序列三端同结果、尺寸变化、键盘控制与错误提示 | 仅核对三端根共享导出及React驱动使用同一7条spy parity；没有实际rrweb DOM或三端UI/键盘运行，入口对称不等于完整可访问性。 |
| SV-04 / C1, C4, C5 | React Replay维护者 | RV-070修复后：首次layout多次seek保留最新值；StrictMode、SSR/hydration、快速props变化、卸载后晚到结果与多个root | RV-070已证但未修，不需要重复复现；现有StrictMode仅证明stub活句柄计数，未运行真实异步及多root。修复不能改变加载前play/pause空操作。 |
| SV-05 / C4, C5 | React Replay组件测试维护者 | 恢复回调换新、相同原始输入重渲染无update、新身份replay仅update、错误props的正反类型用例 | 源码delta比较及Effect Event说明委托方向；已读现有time回调换新/replay身份spy断言，不把未包含的恢复回调/相同值/错误类型场景包装成已测。 |
| REL-01 / C5 | Replay React包发布与消费类型维护者 | 独立tarball根ESM runtime import、TS strict typed consumer、peer React/core兼容边界及SSR消费 | 历史pack仅有10文件记录和旧入口解析结论，本轮不重build/pack或跑发布大矩阵；根既有skipLibCheck:true不能作为关闭库检查后独立消费通过的证据。 |

## 7. 收口及机器证据

**源码/意见完整，专项/发布未全验。** 旧plan/results把这几件事统一记为partial；本轮按packages-only指令拆账，原最低场景没有被删除或缩成spy场景。🟡由仍Open的RV-070和明确消费/真实链路边界支撑，不是自动绿，不冒充已修。

- [本包 plan](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/packages/rxdb-plugin-replay-react.md)：原 C 与源码完成条件，独立专项/发布清单。
- [file-inspection.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/file-inspection.json)：12文件真实SHA/N/完整readRanges/具体notes/C。
- [c-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/c-evidence.json)：C1–C5原动作/场景、结论、源码与测试角色、未验归属。
- [reused-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/reused-evidence.json)：同hash RV-070、历史四指标/pack/未运行边界。
- [closure.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-react/closure.json)：sourceReviewComplete=true、opinionDeliveryComplete=true，五原C齐全，评级🟡、确认问题/candidates与owner原因。

范围内业务/原tests/依赖无改动；仅更新本包 plan/results/evidence，并以用户指定脚本校验后原子更新50包总进度与ETA。
