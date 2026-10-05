---
kind: review-execution
object: rxdb-model
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-model：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

框架无关的 metadata 驱动表单、详情、可编辑表格、查询构造和 UI 共享能力。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-model/src/entity-capabilities.ts`](../../../../packages/rxdb-model/src/entity-capabilities.ts)
- [`packages/rxdb-model/src/entity-form/form-data.ts`](../../../../packages/rxdb-model/src/entity-form/form-data.ts)
- [`packages/rxdb-model/src/entity-form/form-validation.ts`](../../../../packages/rxdb-model/src/entity-form/form-validation.ts)
- [`packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts`](../../../../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts)
- [`packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts`](../../../../packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts)
- [`packages/rxdb-model/src/entity-detail/detail-tabs.ts`](../../../../packages/rxdb-model/src/entity-detail/detail-tabs.ts)
- [`packages/rxdb-model/package.json`](../../../../packages/rxdb-model/package.json)
- [`packages/rxdb-model/project.json`](../../../../packages/rxdb-model/project.json)
- [`packages/rxdb-model/src/index.ts`](../../../../packages/rxdb-model/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 metadata 到 UI 契约：逐字段核对 nullable/readonly/enum/format/relation 与默认值、可编辑性和能力显示。
- [ ] C2 表单提交与验证：核查数据转换、错误归属、NEW/UPDATE 与字段级约束，避免保存时静默丢输入。
- [ ] C3 表格、查询与游标：审查 editable columns、query builder、分页/排序和 callback 生命周期。
- [ ] C4 DOM / clipboard 安全：核查 overlay editor、图标/SVG、文本格式和剪贴板的注入边界。
- [ ] C5 框架无关与消费：对照三端组件调用，检查共享内核是否夹带具体框架依赖、单例或 theme 特例。
- [ ] C6 可访问性与性能：核查编辑器键盘、弹层 aria、长列表/大表格与对象引用稳定性。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-model` 的 117 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/6，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：7 个文件有正文片段、0 个仅测试 outline、3 个仅导航锚点、107 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                         | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 48 passed (48)；Tests 993 passed (993)                                             | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 661–789；新增 review-parallel 不在此基线                                                                                                                        |
| 四项覆盖率               | statements / branches / functions / lines = 94.31% / 86.73% / 94.36% / 95.71%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                               | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 190 个包内文件，declared entries 缺失 0；root 解析通过                                        | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `packages/rxdb-model`；未执行 typed consumer/runtime import                                                                                             |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

共享内核与 Form 局部 draft/fieldChanged/formSubmitted 已分层，事件通知不是数据库保存成功。大批 table/list/query-builder/overlay/真实 UI 测试内容未读完，*.real.spec 名称不自动升级为真正 repository/browser 证据。

### 逐 C 结论（原场景没有缩小）

#### C1 metadata 到 UI 契约 — partial

原动作：逐字段核对 nullable/readonly/enum/format/relation 与默认值、可编辑性和能力显示。
原最低场景：隐藏系统字段、只读字段、不可用操作、未注册关系；UI 不能承诺核心不允许的写入。

**已证结论**：create 排除 computed、view 标 readonly、visibility 单独过滤；能力派生依 getEntityPermission 的 both；nullable/enum/relation 等字段属性在共享接口可见。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-form/form-fields.ts:17–47`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-capabilities.ts:33–37`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-form/interfaces.ts:16–55`（read-implementation）

**必要缺口 / 不能核销原因**：extractEntityFields 的完整 metadata/未注册关系规则及每项对应 UI 验证未读完，不能承诺全部写入能力已正确显示。

#### C2 表单提交与验证 — partial

原动作：核查数据转换、错误归属、NEW/UPDATE 与字段级约束，避免保存时静默丢输入。
原最低场景：空值、BigInt/binary/日期、非法 JSON、关系改变、异步保存拒绝；用户输入可恢复。

**已证结论**：提交差异跳过 readonly，解析字段值后 structuralEqual 比较；validateForm 跳过 hidden/readonly；默认 data 按字段 type 创建。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-form/form-data.ts:17–83`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-form/form-validation.ts:15–34`（read-implementation）

**必要缺口 / 不能核销原因**：parse/format 严格边界、BigInt/binary/date/非法 JSON/关系改变/保存失败的全部测试体与三端 UI 未读完；原输入恢复缺完整证据。

#### C3 表格、查询与游标 — partial

原动作：审查 editable columns、query builder、分页/排序和 callback 生命周期。
原最低场景：相同排序值、可空列、字段切换、保存期间数据刷新、选择跨页；以 repository 结果复验。

**已证结论**：未形成通过结论；只登记当前入口，不声称实现或测试已完整评审。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:27–27`（navigation-only-not-deep-read）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:181–181`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：表格 columns/query/cursor/保存中 refresh/跨页选择未深审；测试 993 passed 与 coverage 不能替代此 C 的真实 repository 场景映射。

#### C4 DOM / clipboard 安全 — partial

原动作：核查 overlay editor、图标/SVG、文本格式和剪贴板的注入边界。
原最低场景：恶意 HTML/SVG、粘贴公式/超大数据、portal 卸载、焦点恢复；无注入与悬挂全局 DOM。

**已证结论**：未形成通过结论；只登记当前入口，不声称实现或测试已完整评审。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:25–47`（navigation-only-not-deep-read）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:119–133`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：overlay/图标/SVG/剪贴板相关实现与恶意 HTML/SVG、公式/大数据粘贴、portal 卸载、焦点恢复场景未读完/未动态复验。

#### C5 框架无关与消费 — partial

原动作：对照三端组件调用，检查共享内核是否夹带具体框架依赖、单例或 theme 特例。
原最低场景：Angular/React/Vue 同 metadata fixtures、独立打包导入、同一编辑器多实例；类型与行为对称。

**已证结论**：已读取的共享 form helpers 没有具体框架 import；三端根入口皆依赖共享 model，form data 与事件结构可追溯。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/index.ts:6–57`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-form/interfaces.ts:16–116`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-form/form-data.ts:17–83`（read-implementation）

**必要缺口 / 不能核销原因**：全部共享内核（117 文件）、theme/singleton、同 metadata 三端 fixture、独立 typed/runtime pack 导入与同编辑器多实例未完整证明。

#### C6 可访问性与性能 — partial

原动作：核查编辑器键盘、弹层 aria、长列表/大表格与对象引用稳定性。
原最低场景：键盘进入/退出、错误提示、1000+ 行滚动、快速切页；先量化耗时/内存，再决定优化。

**已证结论**：未形成通过结论；只登记当前入口，不声称实现或测试已完整评审。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:34–47`（navigation-only-not-deep-read）

**必要缺口 / 不能核销原因**：没有当前 1000+ 行耗时/内存测量和真实键盘/aria/弹层焦点证据；不以单元覆盖率或“可进一步审查”替代性能结论。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 117 个全范围文件已登记，107 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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
