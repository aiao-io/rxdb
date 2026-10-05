---
kind: review-execution
object: rxdb-model-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-model-angular：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular：metadata 驱动的表单、详情、列表、表格、弹窗与查询构造 UI 封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts`](../../../../packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts)
- [`packages/rxdb-model-angular/src/entity-list/entity-list.component.ts`](../../../../packages/rxdb-model-angular/src/entity-list/entity-list.component.ts)
- [`packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts`](../../../../packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts)
- [`packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts`](../../../../packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts)
- [`packages/rxdb-model-angular/package.json`](../../../../packages/rxdb-model-angular/package.json)
- [`packages/rxdb-model-angular/project.json`](../../../../packages/rxdb-model-angular/project.json)
- [`packages/rxdb-model-angular/src/index.ts`](../../../../packages/rxdb-model-angular/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 失败，已留原日志              | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

当前确认意见：RV-040（已修复，记录已删除）；仅对已取证专题下结论，不代表全对象审完。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 表单/详情与字段契约：按 shared model 的所有字段/关系/readonly/format 规则核对三端 UI，检查 defaults、NEW/UPDATE、验证和显示。
- [ ] C2 列表/表格的真实写入口：追踪行删除、批量写、单元格编辑、筛选排序和游标；实例 remove 与 mutations 不能只审一条。
- [ ] C3 弹窗、portal 与可访问性：检查 EntityDialog/QueryBuilder/editor 的焦点、键盘、aria、portal cleanup 和不可信文本渲染。
- [ ] C4 Angular 生命周期与注入：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
- [ ] C5 Angular 类型与运行证据：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 续执行：2026-10-03 边界取证

### C5：真实组件 fixture 生命周期

🟢 RV-040（已修复，记录已删除）：两个共享 RxDB 未销毁的真实组件套件合跑失败，已补齐共享 fixture 的 teardown。detail 单文件 **17 passed**、list 单文件 **44 passed**，原两文件组合 **1 failed / 60 passed**，全包隔离 **35 failed / 249 passed**。给两文件临时副本补显式 afterAll teardown 后 **61 passed**，原始文件 SHA 未变，副本已删除。

证据：原组合、cleanup 对照、输入 SHA / 命令。静态实体构造的多库歧义保护应保留；不能凭门禁红就改业务关系组件或核心的数据库选择规则。

原门禁仍红，试验副本绿不是已经修复。C5 只完成这一项 fixture 问题取证，不等于所有真实路由、模板类型和 UI 交互已核查。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-model-angular` 的 63 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：3 个文件有正文片段、0 个仅测试 outline、4 个仅导航锚点、56 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                         | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 13 passed (13)；Tests 295 passed (295)                                             | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 949–1330；新增 review-parallel 不在此基线                                                                                                                       |
| 四项覆盖率               | statements / branches / functions / lines = 92.78% / 84.63% / 90.79% / 94.56%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                               | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 9 个包内文件，declared entries 缺失 0；root 解析通过                                          | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `dist/packages/rxdb-model-angular`；未执行 typed consumer/runtime import                                                                                |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

共享内核与 Form 局部 draft/fieldChanged/formSubmitted 已分层，事件通知不是数据库保存成功。大批 table/list/query-builder/overlay/真实 UI 测试内容未读完，*.real.spec 名称不自动升级为真正 repository/browser 证据。

### 逐 C 结论（原场景没有缩小）

#### C1 表单/详情与字段契约 — partial

原动作：按 shared model 的所有字段/关系/readonly/format 规则核对三端 UI，检查 defaults、NEW/UPDATE、验证和显示。
原最低场景：非法输入、relation 改变、只读/隐藏字段、提交失败；保留输入并展示核心错误。

**已证结论**：Angular Form 的输入/output/linkedSignal 位置已定位，但主要函数体、父详情保存链路未全部读取。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:251–337`（navigation-only-body-not-fully-read）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:74–74`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：完整字段/关系/readonly/format/NEW-UPDATE 与父组件保存失败/输入恢复未逐项完成；不能把 form 本地事件等价成持久化成功。

#### C2 列表/表格的真实写入口 — partial

原动作：追踪行删除、批量写、单元格编辑、筛选排序和游标；实例 remove 与 mutations 不能只审一条。
原最低场景：操作权限拒绝、并发保存、跨页选择、NULL/同值排序、删除失败；UI 不假成功，结果与 repository 一致。

**已证结论**：未形成通过结论；只登记当前入口，不声称实现或测试已完整评审。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:189–189`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：实例 remove / mutations 两类真实写入口、权限拒绝/并发保存/跨页选择/NULL 同值排序/删除失败未深读。已有 *.real.spec 命名不证明真 SQLite/PG：测试 fixture 和 fake VTable 的来源未完成内容审查。

#### C3 弹窗、portal 与可访问性 — partial

原动作：检查 EntityDialog/QueryBuilder/editor 的焦点、键盘、aria、portal cleanup 和不可信文本渲染。
原最低场景：多弹窗、ESC/焦点返回、保存中关闭、恶意 snippet、卸载；三端具备同功能，不强改原生表达。

**已证结论**：未形成通过结论；只登记当前入口，不声称实现或测试已完整评审。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:26–26`（navigation-only-not-deep-read）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:130–130`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：Dialog/QueryBuilder/portal 的焦点/ESC/aria、保存中关闭、恶意文本与卸载未完成内容及真实浏览器复验；不借 300+ passed 抹平未知。

#### C4 Angular 生命周期与注入 — partial

原动作：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
原最低场景：切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。

**已证结论**：输入/事件根入口与共享表单契约已定位；此 C 的完整生命周期暂不下通过结论。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:251–337`（navigation-only-body-not-fully-read）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:130–130`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：Angular route/子 provider/销毁中保存，React StrictMode/多 root/async 旧 props，Vue deep props/readonly/computed/真实 SFC scope 均未全证；大量源码和测试尚未深读。

#### C5 Angular 类型与运行证据 — partial

原动作：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。
原最低场景：typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。

**已证结论**：根导出的表单/详情/列表/表格/QueryBuilder 家族与共享 model 依赖已经定位；真正包内入口及 root ESM resolve 通过。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/index.ts:7–25`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:251–337`（navigation-only-body-not-fully-read）

**必要缺口 / 不能核销原因**：尚缺独立 typed consumer/runtime import、模板或 SFC 负例及完整 UI 链路；TS/Vue 生成声明不由 root resolve 自动证明；本对象非全范围阅读完成。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 63 个全范围文件已登记，56 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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
