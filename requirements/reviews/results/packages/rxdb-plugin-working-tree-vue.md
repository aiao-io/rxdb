---
kind: review-execution
object: rxdb-plugin-working-tree-vue
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-working-tree-vue：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Vue：working-tree status/diff/commit/discard/restore 的框架状态与动作封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts`](../../../../packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts)
- [`packages/rxdb-plugin-working-tree-vue/src/index.ts`](../../../../packages/rxdb-plugin-working-tree-vue/src/index.ts)
- [`packages/rxdb-plugin-working-tree-vue/package.json`](../../../../packages/rxdb-plugin-working-tree-vue/package.json)
- [`packages/rxdb-plugin-working-tree-vue/project.json`](../../../../packages/rxdb-plugin-working-tree-vue/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 状态与作用域：核查 activation/branch/能力状态如何进入 hook，status/diff 订阅必须归属当前数据库。
- [ ] C2 动作结果与并发：逐项对照 commit/discard/restore 的返回值拒绝和 switchBranch 的异常，不能一律当异常或成功。
- [ ] C3 三端与敏感数据：核查更新触发、错误显示、diff 摘要和类型消费，并与 shared fixtures / 应用工作树场景对应。
- [ ] C4 Vue 生命周期与响应式来源：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
- [ ] C5 Vue 类型与 SFC 消费：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-working-tree-vue` 的 14 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：5 个文件有正文片段、1 个仅测试 outline、0 个仅导航锚点、8 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                 | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 2 passed (2)；Tests 48 passed (48)                                         | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 8952–8988；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 100% / 100% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 10 个包内文件，declared entries 缺失 0；root 解析通过                                 | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `packages/rxdb-plugin-working-tree-vue`；未执行 typed consumer/runtime import                                                                           |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

十二格状态 + 十二个 core commands；没有 Observable 自动变更流，只有本入口执行动作才 patch。查询 empty 与命令 success/reject 的区别保留 core contract，CAS/restore 返回值不是 throw。React state/patch 稳定闭包跨库 ownership 有待复验；另外两端不未经复验归为同一根因。

### 逐 C 结论（原场景没有缩小）

#### C1 状态与作用域 — partial

原动作：核查 activation/branch/能力状态如何进入 hook，status/diff 订阅必须归属当前数据库。
原最低场景：未 enable、插件缺失、切分支、换库、多实例；不显示旧库 diff 或偷偷启用数据库能力。

**已证结论**：初始十二格 idle、创建入口不发 IO；读取 provider 后只创建共享 core commands。；status/diff 是显式方法状态，不是自动订阅；三端 README 明确 entity.save/其他标签页不会自动更新，不把这个已声明行为当 bug。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:150–174`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts:94–171`（read-implementation）

**必要缺口 / 不能核销原因**：未 enable、缺插件、真实 branch/数据库切换和多实例状态 ownership 未全证；React provider 切 A→B 候选的两条新回归等待主控，不提前算红/绿。

#### C2 动作结果与并发 — partial

原动作：逐项对照 commit/discard/restore 的返回值拒绝和 switchBranch 的异常，不能一律当异常或成功。
原最低场景：CAS 落败、dirty tree、不可达 commit、并发点击、动作中换 scope；原有数据不损坏。

**已证结论**：共享 REJECTED_RESTORES 的四种拒绝与 CAS conflict 原样作为 success/value，switchBranch dirty 拒绝是 error + 原样抛出；状态刷新失败不改变已完成 commit 返回值。；credentials/options 只由共享 commands 透传；wrapper 不自行提交/改 HEAD。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:150–174`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:125–137`（read-dependency-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:231–299`（read-dependency-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts:234–328`（read-implementation）

**必要缺口 / 不能核销原因**：缺真实数据层并发点击/CAS 落败不损坏数据以及动作中换 scope；现有 IO fixture 不拥有真正数据库。React 旧 commands 回写新 scope 候选待补跑。

#### C3 三端与敏感数据 — partial

原动作：核查更新触发、错误显示、diff 摘要和类型消费，并与 shared fixtures / 应用工作树场景对应。
原最低场景：相同拒绝序列三端同语义、关闭清理、敏感字段摘要；不能为调试直接输出完整历史。

**已证结论**：十二个方法与十二格状态实际对齐；类型不重定义/不再导出 core 错误类，这是三端一致的既定 contract，不误报缺失透传。；三端用同官方测试 fixture，但 enableIfEmpty/commitChanges 的 presence guard 不等于执行了这些命令。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:150–174`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/index.ts:16–17`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts:447–520`（read-implementation）

**必要缺口 / 不能核销原因**：缺真实应用拒绝序列、关闭期间晚到状态、多实例敏感 diff 摘要/清理以及独立 typed 消费；不能用 100% wrapper coverage 证明 core 历史数据安全。

#### C4 Vue 生命周期与响应式来源 — partial

原动作：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
原最低场景：替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。

**已证结论**：Angular TestBed 注入、React 真 renderHook/provider、Vue 真 mount/provider harness 已辨别；核心 IO 仍是测试桩。；resource 没有独立 Observable 订阅；不能虚构 unsub 测试代替实际 pending command 生命周期。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:150–174`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/__tests__/rxdb-provider-harness.ts:1–11`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/__tests__/setup-harness.ts:1–9`（read-implementation）

**必要缺口 / 不能核销原因**：Angular 实际组件销毁/子 provider、多实例；React StrictMode/多 root/旧库 pending（新 probe 未跑）；Vue provider ref 替换与 SFC scope/晚到命令，均未完整证明。

#### C5 Vue 类型与 SFC 消费 — partial

原动作：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。
原最低场景：vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。

**已证结论**：Signal / render snapshot / ComputedRef 只改变状态容器；commands 返回 Promise 与 core 结果保持同结构；基线类型和 lint 已过。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:52–105`（read-implementation）

**必要缺口 / 不能核销原因**：Angular 模板/route、React 独立 typed consumer + StrictMode 错误 props、Vue vue-tsc/SFC readonly/emits pack consumer 未完整验证；root resolve 是路径证据而非声明/运行证明。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 14 个全范围文件已登记，8 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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

## 2026-10-05 R2-08 包级有界收尾

**🟡 本轮有界交付 phase done；全对象 execution partial、完整 C 0/5、不是完整对象候选，未宣称发布就绪。** 本节更新此前“仅正文片段/未读 8 文件”的历史事实：截至本次 `2026-10-05T11:33:00.580418+08:00`，实际已完整实读 **14/14**；原受控文件与 scope 全部一致，新增 spec 单列。原报告不删，当前结论以本节及 closure 为准。

### 核心生产锚点与三端真实差异

- Vue `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:150-174`：`useRxDB()` 返回实例被取一次，`shallowRef` 只保持浅状态，computed 分格；没有 ref/getter 参数、watch、onScopeDispose/onUnmounted 或取消。provider 的 Ref 可以换，现存 resource 却仍绑定创建时的库；不能称“新输入自动生效”。
- 上游 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/rxdb-vue.ts:19-38,114-145,225-237`：Ref/undefined 是 provider 超集；函数/Promise 按一次性 factory 解析且仅 provider 自造的库由其 destroy。读实例快照与读注入 Ref 是两套接口；不要混同。
- core `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:125-137,205-229,259-299`：latest-only 逐 key 代次不是 scope token，不取消事务；CAS/restore 拒绝保留 success 值，dirty switchBranch 抛原错，refresh 失败不改 commit 成功；versionManager() 现取的 getter 仍属同一已捕获库。
- Vue `ComputedRef` 读 `.value`，Angular `Signal` 调 `()`，React `Readonly<WorkingTreeAsyncStates> & WorkingTreeCommands` 是当前 render 快照。三端公开 24 成员归一后一致；React 随 database render 重建 commands 而 state 延续（已有 RV-069），Vue/Angular 不同样自动重建。没有将“同名 API”当“生命周期全对称”。
- `WorkingTreeResource` 无 generic 参数，也没有本包的 component props/emits；这些局部不适用不豁免独立 SFC/vue-tsc、template readonly、provider input 与生命周期原场景。类型/错误从 core peer 直接 import 是三端已有决定，不误报遗漏转出。

### 已读取的主控当前证据，和绝不能继承的新增面

| 测量面       | 真实记录                                                                                                                                                                                                      | 边界                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 原 unit      | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt:930-965`：2 files、48 tests、0 failed/skip                       | 仅原 spec；十对象总任务 exit=1 不是本包失败；新 probe 未包含                                                             |
| 四指标       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage/rxdb-plugin-working-tree-vue/coverage-summary.json`：100/100/100/100 | 28 statements、20 functions、26 lines，含 2 harness；branches 0/0 不证明 core 安全/分支                                  |
| build/lint   | 当前主控状态 exit=0；已记录输入与原本包 12 个运行面文件无漂移                                                                                                                                                 | 新 spec 的 lint/spec 类型门禁仍需主控补跑；当前 typecheck 按 observation 保存，不借历史绿                                |
| 生成/pack    | 实读 dist JS/dts，并核对 map 来源、实际 tar 与 current 字节                                                                                                                                                   | 来源一致不是第二次构建确定性；publish root 是本包源码目录，Angular 对照不按源 manifest 缺 exports 判错                   |
| root runtime | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/consumer-rxdb-plugin-working-tree-vue-root-import.txt`：exit 0，runtime 仅 useWorkingTree               | 不等于 setup/SFC 挂载或声明 strict consumer                                                                              |
| 独立 typed   | .mts/.vue 正反例均已落盘；要求 strict、skipLibCheck:false、无 paths/aliases/工作区链接                                                                                                                        | 独立 .mts 正例 0 / 反例 2，5 个预定诊断与双 fixture SHA 匹配；SFC 仍待测，显式 Node/@types/ms 环境不等于 bare 声明自包含 |

### 五个原 C：逐项保留原完成面

#### C1 状态与作用域 — partial

原最低场景：未 enable、插件缺失、切分支、换库、多实例；不显示旧库 diff 或偷偷启用数据库能力。

局部已有证据：原 48 tests 中十二格 idle/不主动 IO、缺 provider 抛错和 switchBranch 参数/自动 status 刷新场景通过。；源码只提供显式查询状态，没有 status/diff 的自动订阅，不能虚构退订项。

必要未验：新增未 enable/缺插件/Ref 换库/多实例桩场景未运行。；真实未 enable/缺插件数据库与分支/库切换时旧 diff 不显示、状态 ownership；桩不能证明。

下一步：主控运行新 probe 后按实际快照行为裁定 C1 结果；真实数据/应用换 scope 仍须补证或明确分流。

#### C2 动作结果与并发 — partial

原最低场景：CAS 落败、dirty tree、不可达 commit、并发点击、动作中换 scope；原有数据不损坏。

局部已有证据：原测试证明 CAS conflict/四种 restore 拒绝保留 success+原结果；dirty switchBranch 抛原错并记 error。；status 刷新失败只落 statusState；不改变已经完成的 commit 结果。

必要未验：同格并发/异格隔离及飞行 commit 换 provider Ref 的新 probe 未运行。；真实 CAS 落败、dirty/不可达恢复、并发写入以及动作中换 scope 的数据无损性；core 桩没有事务。

下一步：主控先跑 bounded state probe；数据无损必须引用真实 core/应用同场景证据，不能从 state success 推导。

#### C3 三端与敏感数据 — partial

原最低场景：相同拒绝序列三端同语义、关闭清理、敏感字段摘要；不能为调试直接输出完整历史。

局部已有证据：24 成员的 AST 对照：12 状态/12 命令及 core 类型归一后三端一致；Vue 生成 dts 同形。；本 wrapper 的实现无调试/console 输出；不把直接返回 WorkingTreeDiff 解释成已脱敏摘要。；原 tests 使用核心官方共享拒绝载荷；没有把 fixture 的存在当作三端真实应用序列已测。

必要未验：卸载后的 retained diff/晚到 command probe 未运行；不存在该 hook 的自动敏感信息擦除证明。；三端真实相同拒绝序列、关闭清理与真实应用敏感字段摘要/日志边界未完成。

下一步：主控裁定 lifecycle 特征化测量后仍单列实际关闭/敏感数据显示验证；不扩其它功能族。

#### C4 Vue 生命周期与响应式来源 — partial

原最低场景：替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。

局部已有证据：useWorkingTree() 不接收 ref/computed/getter 参数；状态是只读 ComputedRef 容器，不是可写 reactive entity。；provider 原生 Ref 透传；函数由 Promise 链求值一次，属于 factory，不是 watch getter。；provider 的 onScopeDispose 只负责自身创建/等待的库；外部实例/Ref 归调用方所有。

必要未验：新 provider factory/ref、watch/identity、多实例与卸载 probe 尚未运行。；provider computed/ref 深改来源、真实 SFC 卸载/重新挂载/关闭库中的命令与数据 ownership，不能用 no subscription 代替。

下一步：主控运行新 probe、如实标快照/disposing 的当前行为；没有完整原场景前仍 partial。

#### C5 Vue 类型与 SFC 消费 — partial

原最低场景：vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。

局部已有证据：真实 tar 包根 runtime import exitCode=0，运行时仅 useWorkingTree；它不等于 setup/SFC 挂载。；生成声明的 24 成员/零参数入口与源 AST 对齐，实际 tar 的 JS/dts/source/manifest 字节逐个与 current 对照。；已有项目 build 原声明输出通过；fresh typecheck 尚须主控状态，不用内部 paths 当 consumer。

必要未验：独立发布包 .vue 的 vue-tsc 正/反例（模板解包、readonly、emits）未运行。；真实 SFC/browse 挂载与类型/身份/错误序列的原应用链路未完整证明。

下一步：独立 .mts strict 正/反例已由主控通过，5 个预定诊断与双 fixture SHA 匹配；继续 .vue/vue-tsc 及实际 SFC 链路。额外 Node/@types/ms 需求保留，不冒称 bare 发布声明自包含。

### 原七项完成条件逐条分类

1. **satisfied** — 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。 14/14 完整实读、全区间与关注点记录；scope 摘要全部匹配，生成/发布来源另核。
2. **satisfied** — 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。 5/5 原 C 逐场景有局部已证、源码结论、必要未验与动作；完整 C 0/5。
3. **partial** — 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。 源码 ownership/参数/相位锚点与原测量环境已记录；新 lifecycle 探针尚未执行，真实数据权限/无损链路未证。
4. **partial** — 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。 主控 fresh 原 48 tests/四项/build/lint 已登记；全组 unit exit=1 不指本对象；新 probe 和 consumer 不继承，typecheck 状态按观察记录。
5. **partial** — 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。 core/provider/三端公开面与 native 容器/命令绑定差异已对照，未改用户行为；完整实际 SFC/库关闭/敏感数据链路未证。
6. **partial** — 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。 不扩发现，不新增 RV；既有 React RV-069 仅引用。原 C 的 Vue 快照/disposing 边界交主控跑 probe 后裁定，不提前宣布确认/去重完成。
7. **partial** — 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。 🟡 有界包级阅读/补证交付已完成，可交接；完整对象评审仍 partial，不是完整对象候选，也未宣称发布就绪。

### 最小补证与交接

新 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/__tests__/review-round2-lifecycle.spec.ts`：9 个场景，仅补原 C 的未 enable/缺插件、provider Ref/factory、解构 watch/载荷身份、多实例、同格 latest-only、飞行 commit 换 scope、卸载后 watch/retained diff/late state。**它是当前行为特征化，不是把旧快照或晚到 patch 包装成安全回归通过。** 本子任务未运行 build/test/coverage/e2e/serve/容器，未改业务/原 tests/依赖/总台账/index，也未嵌套 agent。

剩余动作、measurement surface 与主控最终分流责任均在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/closure.json`；请求在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/validation-requests.json`。源码完整阅读不豁免真实事务/应用/SFC/关闭清理；这些未验没有为今天收尾而改成不适用。

### 交接前增量证据（不继承 SFC/生命周期通过）

主控独立 .mts consumer 在 2026-10-05 11:31:58（+08:00）已测：正例 exit=0；反例 exit=2，五条预定诊断全部匹配，两份 fixture SHA 与本目录一致。因此仅 typed .mts 子面已核销，**完整 C5 仍 partial**，SFC/vue-tsc 和真实用户链路未测。详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/validation-observations.json`。

实际 tar 的 JS/dts/src 五份文件与 current 逐字节一致；package.json 的 workspace:* devDependencies 被 pack 转成 0.0.26，键顺序不同，故原始 manifest 字节不相同。已逐项核对 name/version/type/exports/types/import/main/module/files/peers 等发布相关键一致，未误报为源码漂移或假称原始字节全相同。

### 14 文件包职责归属与冻结交接

本包 **state / commands / typedSource 的源码评审已闭合，phase done**；不继续等待通用 core 的全部后端/历史验证。冻结新 probe SHA-256 `6327e258a03caffc502c1aee426d5f370ea1cf56ac27e37a12407b110e56794c`，共 9 场景，主控执行；本任务此后不增删探针。

原 C 的真实事务/CAS 数据无损、实际分支/换库数据 ownership、敏感摘要 UI、关闭库/设备/浏览器链路仍如实未验，归 core/应用/平台评审。它们不是继续扩大本包职责或无限等待的理由，也没有被改成不适用。包内独立 .mts typedSource 已过；最小 .vue 与冻结 probe 由主控补测。**评审交付完成 ≠ 原最低场景全部已测 ≠ 平台全部通过 ≠ 发布就绪**；完整 C 仍 0/5，closure 已逐项分类。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
