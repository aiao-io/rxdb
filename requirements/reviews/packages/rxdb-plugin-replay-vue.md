---
kind: review-plan
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

# rxdb-plugin-replay-vue：原范围全文评审已交付

**源码全文审阅与原 C 意见交付完成；🟡 凑合。** 不把剩余真实场景、修复或发布门禁混作“源码评审没做”，也不把它们假装通过。

## 1. 范围与冻结

- 仅 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue`：13 个受控文件、572 行；源码、配置、原测试、README、LICENSE全部正文重读。
- 范围 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/scope.json`；当前重新解析且与旧resolved相同的Nx配置 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/resolved-project.json`；冻结/写入白名单 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/freeze.json`。
- 原计划与结果未丢失：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/baseline/plan.original.md`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/baseline/results.original.md`。旧计划基线2026-10-03 `2e820521187cbfcd1fe76fb705659fea0a548f0e`；冻结scope引用head `943c50cc85b4be3b0635f736a35a9659c3fe209a`。真正阅读身份以逐文件当前SHA为准，不把共享HEAD推进当本包改动。
- 旧实读且同SHA的真实行区间可复用；旧requestedReadRanges/截断/指纹不算全文。本包旧5片段、8未读，本轮13文件全部fresh全文读取，复用阅读计数0。详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/read-reuse.json`。
- 只写本包plan/results及本包evidence；无业务/原tests/依赖/index修改，无Git写操作、无agent、无第二包。

## 2. 原 C（保留动作与最低场景，不缩 scope）

### C1 播放器挂载与按需依赖

- 原动作：核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。
- 原最低场景：空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。
- **source-review / assessment-delivery：complete-original-scope。** 单组件handle在onMounted创建，props只走delta update，host是组件根div；rrweb在core加载时动态import，不由Vue组件调用start。加载中seek在core已有handle时记最后位置，但首次函数ref调用发生在handle创建前，本次已复现丢失意图。
- 具体源码/测试锚点、已证/未证与owner见本包结果同名C1及 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/c-evidence.json`。
- scenario/release未核销项：V1, V2；不从源码意见完成推导为原全部场景已通过。

### C2 恢复交互与状态

- 原动作：跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。
- 原最低场景：不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。
- **source-review / assessment-delivery：complete-original-scope。** Vue只emit核心事件，不触碰HEAD/工作树；core点marker先pause/seek、显示Restoring，再调用restoreToCommit，拒绝/抛错归一为事件结果。restore凭据现取，依赖WorkingTree CAS。generation防旧UI晚回写，不提供数据库restore取消；不能要求卸载撤销已开始的数据操作。R3-06旧投影title候选已被对照排除，不重新报Replay bug。
- 具体源码/测试锚点、已证/未证与owner见本包结果同名C2及 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/c-evidence.json`。
- scenario/release未核销项：V3；不从源码意见完成推导为原全部场景已通过。

### C3 三端可访问性与类型

- 原动作：对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。
- 原最低场景：同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。
- **source-review / assessment-delivery：complete-original-scope。** 三端共享replay/sessionId/initialTime、时刻与恢复结果、play/pause/seek和同核心DOM。共同透传ReplayerCommitRestoreEvent/replayRestoreHint，Vue expose/ReplayerRef与React ref、Angular实例是框架原生容器，不要求同名Props导出或同生命周期。可访问控件由core负责，parity仅7条边界委托，不是完整UI验收；初始化时序风险按Vue新证据登记。
- 具体源码/测试锚点、已证/未证与owner见本包结果同名C3及 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/c-evidence.json`。
- scenario/release未核销项：V1, V4；不从源码意见完成推导为原全部场景已通过。

### C4 Vue 生命周期与响应式来源

- 原动作：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
- 原最低场景：替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。
- **source-review / assessment-delivery：complete-original-scope。** readInputs持续读props而非首次快照，toRaw保持门面身份，按门面引用与两个标量比较；同原对象代理变化不触发reload。父模板ref/computed解包是Vue表达，本包不声明MaybeRef/getter composable；不把门面内部深变动当换会话。setup局部handle/applied，卸载destroy并清引用。core load/destroy推进UI generation、停自有RAF/rrweb；Vue provider的owned DB destroy与播放视图destroy不同所有权。
- 具体源码/测试锚点、已证/未证与owner见本包结果同名C4及 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/c-evidence.json`。
- scenario/release未核销项：V1, V2；不从源码意见完成推导为原全部场景已通过。

### C5 Vue 类型与 SFC 消费

- 原动作：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。
- 原最低场景：vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。
- **source-review / assessment-delivery：complete-original-scope。** 本包实际是defineComponent TS渲染函数，无泛型composable或自有SFC；props引用core ReplayerOptions，emits与Pick命令类型明确，模板ref用显式ReplayerRef，不拿组件vm类型同React逐字对齐。ESM/declarations/Vue外置与根exports静态一致；vue-shims通用类型不能证明SFC负例。原根strict=true同时skipLibCheck=true，未改变；旧typecheck与实际pack/root解析不等于独立声明/模板/runtime消费，本轮只做运行时边界probe，不伪造strict绿。
- 具体源码/测试锚点、已证/未证与owner见本包结果同名C5及 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/c-evidence.json`。
- scenario/release未核销项：V5；不从源码意见完成推导为原全部场景已通过。

## 3. 运行与发布证据口径

当前resolved test依赖`^build`、typecheck依赖`build/^typecheck`，不能盲跑扩范围。仅初始化新疑点执行共享锁内最小Nx test（2 case，1红1绿0skip），探针/config/日志只放本包evidence；未跑全量build/test/coverage/lint/typecheck。命令与输入SHA在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/validation-observations.json`。

旧unit 10 passed与95.23 / 87.5 / 100 / 100四指标仅保留原happy-dom测量面；已测11个包文件与core mount/parity同SHA允许引用历史证据，不宣称当前环境fresh全门禁。旧实际pack/root resolve不是独立typed/runtime消费。共享根strict=true且既有skipLibCheck=true；本轮不改变任何严格性，也不以旧typecheck代替独立声明验收。

## 4. 完成条件分账

- [x] 原13文件全文阅读，当前SHA、行数、完整区间及具体审阅结论登记。
- [x] 原C1、C2、C3、C4、C5逐条实质意见和必要未证owner交付。
- [x] core Replay、Vue provider release所有权、三端公共语义和原测试测量面实际对照。
- [x] 新风险写入本包findings、保留红/绿证据，正式编号交主控。
- [x] source-review / assessment-delivery按原范围结算。
- [ ] 原最低场景全部运行核销：仍partial，见owner表。
- [ ] 缺陷修复与发布消费/严格声明验收：另列，不由此包评审自动执行。

不增加iframe、真设备、发布大矩阵；Vue ref/expose与React/Angular不用字面对齐。单包交付后先更新50包进度/ETA，再按用户新授权的排他队列进入下一包，不成组局部扫读。

结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-replay-vue.md`；机器结算：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/closure.json`。
