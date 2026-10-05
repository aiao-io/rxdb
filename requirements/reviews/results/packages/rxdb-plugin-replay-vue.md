---
kind: review-execution
object: rxdb-plugin-replay-vue
source_root: packages/rxdb-plugin-replay-vue
created: 2026-10-03
updated: 2026-10-05
execution: complete-original-scope
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial-original-scope
release-validation: not-revalidated
rating: yellow
worker: PKG-replay-vue
---

# rxdb-plugin-replay-vue：全文审阅与逐 C 结算

**source-review / assessment-delivery：complete-original-scope；13/13 文件、572/572 行、原 C1–C5 意见齐全。评级：🟡 凑合。**

本轮发现1个**已复现P2风险候选**：首次函数ref回调的seek意图丢失，正式编号/与RV-070去重交主控。无其它本包新增正式编号。评审交付完成不等于缺陷已修、原全部场景已跑或发布就绪。

## 1. 实读范围、历史对照与执行

四份不截断的正文转录覆盖13文件全行：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/source-read-01.txt` 至 `source-read-04.txt`。`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/file-inspection.json`逐文件记录实际阅读SHA、lineCount、fullTextRead、完整readRanges、具体notes和关联C。旧报告只登记5个片段/8个未读；同SHA只允许复用真实旧阅读，不把指纹升格。本轮全部重新实读，旧plan/results已完整存档。

范围/当前Nx配置：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/scope.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/resolved-project.json`。本包受控文件在最小测试锁内13项全部与阅读SHA一致、无漂移；忽略的dist/out-tsc/node_modules不冒充当前源码或fresh产物。

### 唯一 fresh Nx 复验

- 命令、共享锁、环境、当前输入、原日志：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/validation-observations.json`。
- CI=true、NX_DAEMON=false、maxWorkers=1、fileParallelism=false、skipRemoteCache/skipNxCache；排除依赖任务/同步，**只执行一个本包test target、一个evidence spec**，没有build/上游任务/全量test。
- 真实Vue 3.5.43/happy-dom＋core边界spy：**1 failed / 1 passed / 0 skipped**；首次函数ref seek实际`[]`，父onMounted对照`[500]`。不是rrweb时间轴/数据库/严格类型/发布运行。
- `mergeConfig`使原日志default/junit重复呈现，JUnit实际只有两个case；不重复计数。红断言保留，不skip、不改原测试或业务迁就它。
- 为遵守只写本包evidence，指定锁脚本`--name`采用绝对输出路径、末段保留`packages-only-replay-vue/init-ref-20261005-01`；锁和脚本本体不改。

### 历史证据明确限定

旧unit日志 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt:9222-9252`为10 passed，四指标95.23 / 87.5 / 100 / 100（原阈值各项80%）。11个实际纳入旧输入的本包源码/config/test与core mount/parity SHA仍相同；README/LICENSE未列旧动态输入，不误报漂移。旧根配置/传递依赖/宿主/发布产物不是全部fresh复验，不能由此宣布当前全门禁绿。原日志节选与输入对照分别为 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/inherited-unit-coverage.txt`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/inherited-dynamic-input-comparison.json`。

旧pack记录在旧结果存档中，明确只证tarball目标文件/root解析，没有typed consumer或runtime import；不读忽略产物给新发布背书。最小probe没测coverage、lint、strict；类型/发布另交owner。

## 2. 逐原 C 实质结论

### C1 播放器挂载与按需依赖

**源码审阅/意见：已完成原范围；原场景验证：partial。**

- 原动作：核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。
- 原最低场景：空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。

单组件handle在onMounted创建，props只走delta update，host是组件根div；rrweb在core加载时动态import，不由Vue组件调用start。加载中seek在core已有handle时记最后位置，但首次函数ref调用发生在handle创建前，本次已复现丢失意图。

锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:15-20`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:61-89`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:108-120`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:143-194`。
- 原Vue测试 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/__tests__/replayer.spec.ts:21-60,89-94`；core browser定义 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/__tests__/replayer.browser.spec.ts:104-139,254-302`已读，**定义已读不等于本轮运行**。

必要未证与owner：V1, V2，详见第4节。

### C2 恢复交互与状态

**源码审阅/意见：已完成原范围；原场景验证：partial。**

- 原动作：跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。
- 原最低场景：不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。

Vue只emit核心事件，不触碰HEAD/工作树；core点marker先pause/seek、显示Restoring，再调用restoreToCommit，拒绝/抛错归一为事件结果。restore凭据现取，依赖WorkingTree CAS。generation防旧UI晚回写，不提供数据库restore取消；不能要求卸载撤销已开始的数据操作。R3-06旧投影title候选已被对照排除，不重新报Replay bug。

锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:46-49`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:65-69`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:232-267`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/restore.ts:41-56`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/testing/replayer-parity.ts:174-184`。
- 核心marker/dirty/error browser定义 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/__tests__/replayer.browser.spec.ts:305-371`使用fake ReplayManager，不能证明真实CAS。R3-06源码/归属意见见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-replay.md:97-115`。

必要未证与owner：V3，详见第4节。

### C3 三端可访问性与类型

**源码审阅/意见：已完成原范围；原场景验证：partial。**

- 原动作：对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。
- 原最低场景：同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。

三端共享replay/sessionId/initialTime、时刻与恢复结果、play/pause/seek和同核心DOM。共同透传ReplayerCommitRestoreEvent/replayRestoreHint，Vue expose/ReplayerRef与React ref、Angular实例是框架原生容器，不要求同名Props导出或同生命周期。可访问控件由core负责，parity仅7条边界委托，不是完整UI验收；初始化时序风险按Vue新证据登记。

锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/index.ts:10-12`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:38-49`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/index.ts:10-12`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/index.ts:10-12`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:203-228`。
- `/Users/jimmy/Documents/aiao/rxdb/specs/005-us-909-session-replay/contracts/replayer-component.md:52-77`。
- React `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx:9-24,50-101`；Angular `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/replayer.component.ts:45-117`；共同core键盘定义 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/__tests__/replayer.browser.spec.ts:236-251`，不借Angular夹具运行宣布Vue全UI通过。

必要未证与owner：V1, V4，详见第4节。

### C4 Vue 生命周期与响应式来源

**源码审阅/意见：已完成原范围；原场景验证：partial。**

- 原动作：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
- 原最低场景：替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。

readInputs持续读props而非首次快照，toRaw保持门面身份，按门面引用与两个标量比较；同原对象代理变化不触发reload。父模板ref/computed解包是Vue表达，本包不声明MaybeRef/getter composable；不把门面内部深变动当换会话。setup局部handle/applied，卸载destroy并清引用。core load/destroy推进UI generation、停自有RAF/rrweb；Vue provider的owned DB destroy与播放视图destroy不同所有权。

锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:50-91`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/__tests__/replayer.spec.ts:64-87`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:156-194`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:249-288`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/rxdb-vue.ts:86-143`。
- provider当前接口 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/rxdb-vue.ts:86-143`实际调用`database.destroy()`（不是旧记录笼统“断开”）；工厂/Promise owned，现成实例/Ref caller-owned。Replayer不接管provider或DB生命周期。

必要未证与owner：V1, V2，详见第4节。

### C5 Vue 类型与 SFC 消费

**源码审阅/意见：已完成原范围；原场景验证：partial。**

- 原动作：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。
- 原最低场景：vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。

本包实际是defineComponent TS渲染函数，无泛型composable或自有SFC；props引用core ReplayerOptions，emits与Pick命令类型明确，模板ref用显式ReplayerRef，不拿组件vm类型同React逐字对齐。ESM/declarations/Vue外置与根exports静态一致；vue-shims通用类型不能证明SFC负例。原根strict=true同时skipLibCheck=true，未改变；旧typecheck与实际pack/root解析不等于独立声明/模板/runtime消费，本轮只做运行时边界probe，不伪造strict绿。

锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:9-12`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:36-49`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/vue-shims.d.ts:1-5`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/package.json:23-58`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/tsconfig.lib.json:34-39`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/vite.config.mts:23-28`。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/vite.config.mts:52-80`。
- `/Users/jimmy/Documents/aiao/rxdb/tsconfig.base.json:117-123`。
- 原TS配置 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/tsconfig.json:5-14`、`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/tsconfig.spec.json:11-31`；通用shim并非公开类型消费证明。empty replay/as never只在原spy测试与隔离probe作边界输入，不修改生产类型，不添加any/降strict/skipLibCheck。

必要未证与owner：V5，详见第4节。

## 3. 清理 / 初始化 / 代际 / 隐私的归属边界

1. **视图清理**：Vue只销毁自己的core handle；core destroy幂等、推进generation、停自己的RAF并销毁rrweb。不是录制stop/删除会话/DB release。R3-03全局RAF余帧仍pending，不能冒充本包泄漏。
2. **控制初始化**：公开ref已交给首次函数ref回调时handle尚未建立；seek被丢失。已有handle但core仍loading时的pending seek由core正常保存；不能把两个阶段混为一谈。父onMounted正常，不泛化成Vue所有ref都失效。
3. **两层代际**：core view generation隔离旧load/restore的UI完成；Replay连接纪元由plugin/runtime所有。插件门面在use时建立且跨纪元保持，`not_installed`拒绝未连接调用，状态流按纪元替换（`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/plugin.ts:48-90`）。组件不自行init/connect/install/自动重连；输入引用与连接纪元不是同一个token。
4. **provider release**：Vue provider销毁自造/等来的DB；外部实例/Ref由调用方拥有。Replayer卸载不会顺手destroy外部DB或停止其它组件使用的录制。
5. **记录隐私**：播放器只调用readEvents/listCommitMarkers/restoreToCommit，不调用start，也不把挂组件当授权。core显式start、已有合法stash续录、epoch释放stop/flush/store destroy见 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/manager.ts:101-110,118-147,197-244,281-295`；默认maskAllInputs=true、强制blockSelector见 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/options.ts:79-88`。Vue不扩record options，不承诺任意正文/URL自动脱敏；页面授权/同意UI归应用，非本包新增能力，也不要求本包添加iframe/真设备支持。

## 4. 必要未证、修复与发布分账

### V1 · C1, C3, C4 · fix-and-regression

- owner：主控编号/去重；Vue Replay维护者修复。
- 原因：首次函数ref seek已有红/绿对照，尚未修复和正式编号。
- 场景：首次函数ref seek(500)保持意图；多个初始化seek仅最后值生效；父onMounted调用保持正向行为；卸载后旧句柄不留下可重放意图。

### V2 · C1, C4 · scenario

- owner：Vue Replay与Replay core维护者。
- 原因：原包10用例为mount spy；核心浏览器用例正文已读，但本轮未运行真实Vue到rrweb完整链路。
- 场景：空recording/加载失败/切recording；双播放器独立宿主与卸载；ref/computed/readonly父子输入替换；加载中卸载和晚到结果、多root。
- 不扩要求：新增iframe支持；真设备矩阵；把深改门面内部状态当自动reload契约。

### V3 · C2 · scenario

- owner：Replay core与WorkingTree维护者；Vue层负责结果转发。
- 原因：源码已对照generation、当前凭据与restore委托；R3-06只核销合法真实PGlite恢复子面，未代验完整点击/并发矩阵。卸载不等于取消已开始的数据库restore。
- 场景：Vue实际marker点击的dirty/unreachable/并发恢复序列；恢复中卸载不向旧UI回写；底层CAS/操作结果按原core合同；拒绝与reason=error提示正确转发。

### V4 · C3 · scenario

- owner：Vue Replay可访问性/组件维护者，核心控件维护者协同。
- 原因：公共API与共同DOM合同已源码对照；parity与本轮初始化spy不是真实键盘/尺寸/三端recording输出验收。
- 场景：同recording/marker序列三端同语义结果；原生按钮/时间轴键盘操作及错误提示；宿主尺寸变化下控件与回放显示。
- 边界：只检原支持能力；Vue ref/expose、React ref与Angular实例不要求字面相同。

### V5 · C5 · release

- owner：本包发布/公开类型维护者。
- 原因：源manifest/Vite/dts/exports已读；旧真pack/root resolve不等于typed/runtime消费。原共享tsconfig已skipLibCheck=true，旧绿也不能覆盖探针或独立SFC负例。
- 场景：最小独立Vue SFC consumer：ReplayerRef、props/emits正例与错误输入负例；readonly/computed模板来源消费；当前产物根ESM运行import与声明编译、peer实际版本对照。
- 边界：不扩为全框架/真设备/发布大矩阵；本轮不跑全量build/test/coverage，不改strict/依赖。

## 5. 评级与结算

**🟡 凑合 → 初始化seek已有真实边界红；薄wrapper旧覆盖率与其它包绿不能抹掉它 → 先留回归、只缓存最后seek意图，主控去重编号后由本包维护者最小修复。** 其它接口/委托/资源所有权源码清楚，但未测的真实场景/声明消费不装作全绿。

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/findings.md`：唯一新候选与红/绿证据；正式编号由主控。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/c-evidence.json`：原全部C动作、场景、实质结论与锚点。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/closure.json`：sourceReviewComplete=true、opinionDeliveryComplete=true、CConclusionIds全5项、评级、未证owner、候选。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/file-inspection.json`：13文件572行全文证明；`read-reuse.json`：旧实读/SHA复用口径。

本轮不修改业务、原tests、依赖、index，无手动Git/提交/暂存/重置、无agent。本包交付后仅运行指定`--complete rxdb-plugin-replay-vue`校验/原子更新50包进度与ETA，结算后方可进入用户新授权的下一包；不私自启动队列外包。
