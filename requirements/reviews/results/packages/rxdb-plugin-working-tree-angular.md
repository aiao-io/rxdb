---
kind: review-execution
object: rxdb-plugin-working-tree-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
scenario-validation: partial
assessment-delivery: complete
source-review: complete
---

# rxdb-plugin-working-tree-angular：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular：working-tree status/diff/commit/discard/restore 的框架状态与动作封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts`](../../../../packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts)
- [`packages/rxdb-plugin-working-tree-angular/src/index.ts`](../../../../packages/rxdb-plugin-working-tree-angular/src/index.ts)
- [`packages/rxdb-plugin-working-tree-angular/package.json`](../../../../packages/rxdb-plugin-working-tree-angular/package.json)
- [`packages/rxdb-plugin-working-tree-angular/project.json`](../../../../packages/rxdb-plugin-working-tree-angular/project.json)

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
- [ ] C4 Angular 生命周期与注入：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
- [ ] C5 Angular 类型与运行证据：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-working-tree-angular` 的 15 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：3 个文件有正文片段、0 个仅测试 outline、0 个仅导航锚点、12 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                 | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 2 passed (2)；Tests 48 passed (48)                                         | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 8795–8823；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 100% / 100% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 6 个包内文件，declared entries 缺失 0；root 解析通过                                  | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `dist/packages/rxdb-plugin-working-tree-angular`；未执行 typed consumer/runtime import                                                                  |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

十二格状态 + 十二个 core commands；没有 Observable 自动变更流，只有本入口执行动作才 patch。查询 empty 与命令 success/reject 的区别保留 core contract，CAS/restore 返回值不是 throw。React state/patch 稳定闭包跨库 ownership 有待复验；另外两端不未经复验归为同一根因。

### 逐 C 结论（原场景没有缩小）

#### C1 状态与作用域 — partial

原动作：核查 activation/branch/能力状态如何进入 hook，status/diff 订阅必须归属当前数据库。
原最低场景：未 enable、插件缺失、切分支、换库、多实例；不显示旧库 diff 或偷偷启用数据库能力。

**已证结论**：初始十二格 idle、创建入口不发 IO；读取 provider 后只创建共享 core commands。；status/diff 是显式方法状态，不是自动订阅；三端 README 明确 entity.save/其他标签页不会自动更新，不把这个已声明行为当 bug。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts:166–190`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/use-working-tree.spec.ts:69–145`（read-implementation）

**必要缺口 / 不能核销原因**：未 enable、缺插件、真实 branch/数据库切换和多实例状态 ownership 未全证；React provider 切 A→B 候选的两条新回归等待主控，不提前算红/绿。

#### C2 动作结果与并发 — partial

原动作：逐项对照 commit/discard/restore 的返回值拒绝和 switchBranch 的异常，不能一律当异常或成功。
原最低场景：CAS 落败、dirty tree、不可达 commit、并发点击、动作中换 scope；原有数据不损坏。

**已证结论**：共享 REJECTED_RESTORES 的四种拒绝与 CAS conflict 原样作为 success/value，switchBranch dirty 拒绝是 error + 原样抛出；状态刷新失败不改变已完成 commit 返回值。；credentials/options 只由共享 commands 透传；wrapper 不自行提交/改 HEAD。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts:166–190`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:125–137`（read-dependency-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:231–299`（read-dependency-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/use-working-tree.spec.ts:205–305`（read-implementation）

**必要缺口 / 不能核销原因**：缺真实数据层并发点击/CAS 落败不损坏数据以及动作中换 scope；现有 IO fixture 不拥有真正数据库。React 旧 commands 回写新 scope 候选待补跑。

#### C3 三端与敏感数据 — partial

原动作：核查更新触发、错误显示、diff 摘要和类型消费，并与 shared fixtures / 应用工作树场景对应。
原最低场景：相同拒绝序列三端同语义、关闭清理、敏感字段摘要；不能为调试直接输出完整历史。

**已证结论**：十二个方法与十二格状态实际对齐；类型不重定义/不再导出 core 错误类，这是三端一致的既定 contract，不误报缺失透传。；三端用同官方测试 fixture，但 enableIfEmpty/commitChanges 的 presence guard 不等于执行了这些命令。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts:166–190`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/index.ts:16–17`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/use-working-tree.spec.ts:424–497`（read-implementation）

**必要缺口 / 不能核销原因**：缺真实应用拒绝序列、关闭期间晚到状态、多实例敏感 diff 摘要/清理以及独立 typed 消费；不能用 100% wrapper coverage 证明 core 历史数据安全。

#### C4 Angular 生命周期与注入 — partial

原动作：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
原最低场景：切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。

**已证结论**：Angular TestBed 注入、React 真 renderHook/provider、Vue 真 mount/provider harness 已辨别；核心 IO 仍是测试桩。；resource 没有独立 Observable 订阅；不能虚构 unsub 测试代替实际 pending command 生命周期。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts:166–190`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/use-working-tree.spec.ts:53–72`（read-implementation）

**必要缺口 / 不能核销原因**：Angular 实际组件销毁/子 provider、多实例；React StrictMode/多 root/旧库 pending（新 probe 未跑）；Vue provider ref 替换与 SFC scope/晚到命令，均未完整证明。

#### C5 Angular 类型与运行证据 — partial

原动作：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。
原最低场景：typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。

**已证结论**：Signal / render snapshot / ComputedRef 只改变状态容器；commands 返回 Promise 与 core 结果保持同结构；基线类型和 lint 已过。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts:58–111`（read-implementation）

**必要缺口 / 不能核销原因**：Angular 模板/route、React 独立 typed consumer + StrictMode 错误 props、Vue vue-tsc/SFC readonly/emits pack consumer 未完整验证；root resolve 是路径证据而非声明/运行证明。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 15 个全范围文件已登记，12 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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

## 2026-10-05 R2-07 有界收尾（唯一对象）

**本轮本对象权威状态：15/15 原 scope 文件正文已读；原 C 评审结论完成 5/5；原最低场景全部验证闭合 0/5。对象评审 complete，必要验证 pending-required；不是验证全绿或发布就绪。** 用户最新任务编号 R2-07 优先于 scope 内旧 R2-08；对象没有变，不改调度文件。结论 🟡：评审完成与验证全通过分开。每个原 C 的必要未验都指定主控 owner、核销条件与证据目录；没有证据就不报绿。

日期 2026-10-05（Asia/Shanghai）；源码指纹均与 scope 相符。Git HEAD 浮动，以本目录 start/final 及主控 gate 的输入摘要为准，不拿不同 HEAD 的老绿冒充当前全对象绿。15 个原受控文件（源码/两份旧 spec/setup/全部配置/README/LICENSE）均完整正文读取；新 spec 单独记录为已写未跑，未改旧 tests。

| 原 C                      | 本轮有证结论                                                                             | 原最低场景剩余动作（不删要求）                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| C1 状态与作用域           | 独立 signal、注入时库 ownership、创建无 IO/无隐式 enable；core 缺插件 guard 已读         | 未 enable/缺插件/换库/多实例/输入和分支的新增 probe 待主控；真实 branch/DB 用户链路仍需证据裁定                                   |
| C2 动作结果与并发         | CAS/restore 是返回值，dirty switch 是 throw；同格 latest-only 与原 promise 返回各归其主  | 新并发/动作中换 owner probe 未跑；真实 CAS/dirty/unreachable/并发点击的数据未损坏不能拿 facade stub 证明                          |
| C3 三端与敏感数据         | 同 24 成员，core 类型不重定义，错误类不再导是既定 API；无调试历史输出                    | 三端拒绝序列/应用敏感摘要、关闭清理与 retained diff、strict consumer 未全证；是否需要销毁 guard 由主控契约裁定                    |
| C4 Angular 生命周期与注入 | provider borrowed/owned DB 规则与 wrapper 无订阅/effect 已核；不能顺手 destroy 共享库    | 12 个 OnPush/component/input/child-provider/multi-instance/pending-destroy probe 及新 spec 门禁待跑；现状刻画通过也不自动达成清理 |
| C5 Angular 类型与运行证据 | 生成声明/源接口对齐；真实 tarball root runtime import=0（已 bootstrap Angular compiler） | tsc 正负/ngc 正负/原 README 模板都待跑；happy-dom 组件不是实际 browser/route，真实 route 挂卸及错误空态仍需证据                   |

### 当前可复用测量与禁止越界的读法

- 主控第二轮单对象 **2 files / 48 tests passed，无 skip 行**；四指标 **statements 19/19，branches 0/0，functions 15/15，lines 18/18，均 100%**，门槛各项 ≥80%。整个十包队列 test exitCode=1 与本包通过分开登记；没有继承其他包的绿/红。
- fresh build/lint=0，skipNxCache/skipRemoteCache，parallel=1；每阶段 13 个本对象受控测量输入与当前指纹逐个对照。新 spec 不在该测量中，不能借旧零警告。
- 历史全对象 typecheck=0 属于 44de1138 基线，且本项目 root `skipLibCheck=true`；不等同于严格独立消费者 `skipLibCheck=false`，也未包括新 spec。
- 实际发布根是 `dist/packages/rxdb-plugin-working-tree-angular`，Angular peer 当前 **22.2.1**；源 manifest 缺 exports 不报缺陷。生成 ESM/声明和源接口已对照，但未二次重建证明 bit-for-bit；原 scope 没有受控生成文件。
- 本对象主控消费者记录在读取时仍写 `fixture-not-yet-written`；本轮现已交付，不把待验证消费者说成通过。显式 node+@types/ms 环境和保留的裸 utils 声明缺口分开。root import 0 不是组件/模板/route 运行。

### 有界交付与主控下一步

已写正/负 `.mts`（包名 import，无 alias/any/错误抑制）、独立模板负例及 README 原模板探针；新增唯一 `review-round2-lifecycle.spec.ts` 共 12 例。销毁后的旧 signal 更新/旧命令刷新/保留 diff 为**现状/隔离刻画**，没有承诺清理达标，也没有凭“没 DestroyRef”就报泄漏。没有复制 React RV-069，没有新增已确认 RV；不扩新业务 bug。

主控固定五项动作：① packed strict consumer 正/负；② ngc 正/负与原 README；③ focused lifecycle spec；④新 spec 单对象 lint/typecheck；⑤复用/补最小真实数据、三端/敏感摘要、route 证据并裁定原 C 未验分流。请求详细 project/target/args/reason/criticalForC 已落盘。本代理不跑 build/test/coverage/e2e/server/容器，不等待无关后端，不改实现/依赖/旧 tests/台账/index/旧 RV。

依用户最新口径，本对象七条评审完成条件已按“全范围阅读 + 每原 C 明确结论 + 已确认问题去重 + 必要未验责任/核销条件/证据归属”闭合，评审状态 complete。原最低场景的验证状态仍 pending：通用工作树宿主/CAS 数据安全归 core 联审，不扩读/等待长矩阵；本对象新 spec/cov/types/模板和必要 Angular route 证据由主控交付。**“已有归属”不等于“已验证通过”**，releaseReady=false。本槽位结束，立即交下一 queued，不等待主控队列。

### 本轮逐项证据（绝对路径）

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/file-inspection.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/c-evidence.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/validation-observations.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/validation-requests.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/api-comparison.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/consumer-expectations.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/findings.pending.md`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/source-fingerprint-start.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/source-fingerprint-final.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/closure.json`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-angular/changed-files.json`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/review-round2-lifecycle.spec.ts`

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。

## 2026-10-05 R3-04：required input / OnPush 夹具归属（冻结）

**三轴不混账：source-review complete、assessment-delivery complete；scenario-validation partial；execution partial（旧全验证口径）。** R2 原 scope 15/15 全文阅读、5/5 逐 C 意见/风险交付保留完成，不误计为“没做评审”。原最低场景整项闭合仍 **0/5**，releaseReady=false；不计入完整对象完成。主控完整账仍仅 desktop 残留 1/73，其余 72 有效对象未整包闭合。

### 红/绿因果与真实断言

- `ls` 确认实际 R2 新增文件为 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/review-round2-lifecycle.spec.ts`；没有 owner-component 文件。原 R2 文件、旧失败、source snapshot 都保留未改。按共享锁聚焦复跑仍 12 例、11 pass/1 fail：先 NG0303，后 branchText main ≠ feature。
- 真实 API `useWorkingTree()` 无输入；branchId 是消费组件 UI input。两个未做 Angular 输入变换的 JIT 反例（纯 Angular / 真实 hook）同样 inputs=[]、NG0303、DOM main，证明不需要产品 hook 就能重现旧红。
- 正例由真实 ngc 编译 `input.required<string>()` + standalone/OnPush + 父模板 `[branchId]="branchId()"`，没有手填 signal 元数据。保留原 setInput API 后 DOM 可到 feature；父 signal 来回变化自动更新子 input/DOM，且不切库/切分支或改旧 diff。真实模板按钮透传当前输入，pending/成功后的 status 和拒绝错误自动刷新 DOM。
- 新 probe `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/review-round3-input-component.spec.ts` 最终 **8/8、0 fail/skip，67 次运行时断言**（7+7+4+6+11+11+12+9）。strict tsc 通过；聚焦 Nx lint 零警告；strictTemplates 正例 exit 0，缺 required 输入负例 NG8008、number→string 负例 TS2322。失败的早期 asset 收集（0 tests）与 lint 警告原记录/源快照仍保留，没有改期望或关规则。

**归属结论：旧 branchText 失败属于未注册 signal-input 元数据的 JIT probe；本次不确认产品 DOM 故障，也不宣称全产品正确。** provider/hook/core command 为真实源码；两个测试 token 转交真实函数并断言同一引用；DB、workingTree/versionManager 仍为原共享 facade stubs。真实 DB/branch/revision/CAS 数据正确性未执行，明确不核销。

### 指纹与核销建议

所有实际测试/编译/lint 均走指定 shared-lock 三 scope；Nx 禁本地/远程缓存、单 worker、排除 ^build。各次测量内漂移 0；最终额外 610 个源/配置/声明输入及两个编译资产前后 hash 不变。共享 HEAD 批次间 `76a3848e2086f4617b80f7b1a1b896ef76e5719c` → `72d3bde0303f819b2c88e7fe18130fa231806f1b`，共有 204 个受控输入不变，新增受控路径仅 R3 probe（204→205）；本任务无暂存/提交操作，外部共享提交已在证据中单独记录。

- R2 SHA-256 `051cf96152675639982e5df911ec5872f30426e1b19d18f26aa41e6e4c9b72d0`；R3 SHA-256 `0080a508628820624be01c08395e1ae09abb61363e81c1bb21d2a2e721f035b8`。
- C4 仅建议核销 required input / 父模板 / OnPush 状态通知子面；完整生命周期、cleanup、真实 route 未闭合。
- C5 仅建议核销本次源 fixture 的严格输入模板正反及 probe 类型子面；发布 consumer、README 全模板、事件负例、真实 browser/route 未重验。
- C1-C3 不新增整项核销；不扩浏览器 route、服务或全量 build 矩阵，不把 facade stub 结果当数据安全。

冻结证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/README.md`；全部命令/红绿/逐例断言：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/measurement-summary.json`；最终机器报告：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/r3-vitest-results-final.json`。官方规范抓取与工具失败/精确版本边界均在本目录 official 中如实登记。
