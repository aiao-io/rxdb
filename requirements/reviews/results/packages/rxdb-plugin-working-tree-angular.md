---
kind: review-execution
object: rxdb-plugin-working-tree-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
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
