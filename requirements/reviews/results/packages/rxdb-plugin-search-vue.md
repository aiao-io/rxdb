---
kind: review-execution
object: rxdb-plugin-search-vue
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-search-vue：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Vue：SearchHandle 的框架响应式输入、结果、状态与清理封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-search-vue/src/use-search.ts`](../../../../packages/rxdb-plugin-search-vue/src/use-search.ts)
- [`packages/rxdb-plugin-search-vue/src/index.ts`](../../../../packages/rxdb-plugin-search-vue/src/index.ts)
- [`packages/rxdb-plugin-search-vue/package.json`](../../../../packages/rxdb-plugin-search-vue/package.json)
- [`packages/rxdb-plugin-search-vue/project.json`](../../../../packages/rxdb-plugin-search-vue/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 SearchHandle 映射：逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。
- [ ] C2 快速输入与 options identity：核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。
- [ ] C3 三端类型与依赖闭合：对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。
- [ ] C4 Vue 生命周期与响应式来源：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
- [ ] C5 Vue 类型与 SFC 消费：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-search-vue` 的 14 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：4 个文件有正文片段、0 个仅测试 outline、0 个仅导航锚点、10 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                     | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 4 passed (4)；Tests 28 passed (28)                                             | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 8989–9057；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 98.57% / 96.42% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                           | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 10 个包内文件，declared entries 缺失 0；root 解析通过                                     | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `packages/rxdb-plugin-search-vue`；未执行 typed consumer/runtime import                                                                                 |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

输入 query 是 consumer 所有；结果/state/error/hasMore 归属 core handle。重建先 unsubscribe/destroy 旧 handle；命令通过 active/ref 路由最新 handle。initialQuery 仅初次种子，不能当作 v-model/受控 query。Angular 清空 last 防二次 setQuery，Vue suppressedQuery 同样防 clear 回声；React clear 更新 queryRef。

### 逐 C 结论（原场景没有缩小）

#### C1 SearchHandle 映射 — partial

原动作：逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。
原最低场景：空词、无结果、查询失败、清空、末页；框架状态不能吞掉核心错误。

**已证结论**：已逐项核对 query/results/state/error/hasMore 及 loadMore/clear/retry 路由；旧套件通过。；Angular 既有 221–255 用真实 core handle 验证两页及末页；React/Vue 既有主体是 BehaviorSubject 句柄桩，不能算同一真实 core 场景。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:112–234`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/__tests__/use-search.spec.ts:49–122`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/__tests__/review-parallel-real-handle.spec.ts:1–71`（owned-new-test-not-yet-run）

**必要缺口 / 不能核销原因**：三端同序列空词→无结果→失败→重试→末页→清空的真实 core handle 新探针已写，主控尚未补跑；因此不把 C1 提前核销。

#### C2 快速输入与 options identity — partial

原动作：核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。
原最低场景：A→B 快速输入、相同值新对象、换库/branch、并发翻页；不重复创建 handle 或串结果。

**已证结论**：source/options identity 的重建与当前 query 保留已有断言；initialQuery 只播种、不当作受控输入；语义等价对象不重建。；Vue 已实际读取并核对 options 深修改回归（pageSize/collections）；React snapshot 复制 collections；Angular 接受 Signal。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:53–61`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:156–204`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/__tests__/use-search.spec.ts:270–407`（read-implementation）

**必要缺口 / 不能核销原因**：缺 A→B 真正异步查询代次与 branch 变化并发翻页的三端同 fixture；既有桩 emission 隔离不等价于完整搜索后端时序。

#### C3 三端类型与依赖闭合 — partial

原动作：对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。
原最低场景：缺 plugin、typed consumer、同 fixtures parity、卸载；必须依赖能通过 inject 闭合。

**已证结论**：三端根入口同样透传 SearchExecutionError（运行时）、SearchHandle/SearchOptions/SearchResult/SearchState（类型）和 SearchSourceLike/UseSearchReturn。；已读取真实 pack 的发布根/入口清单及独立 root ESM resolve；没有拿 Angular 源 manifest 缺 exports 误报。；React README consumer 只定义函数、由本轮 workspace typecheck 编译；它没有启动数据库或挂载页面。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/index.ts:13–16`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:112–234`（read-implementation）

**必要缺口 / 不能核销原因**：pack 证据未执行声明编译/runtime import；缺插件、backend 不支持、typed root consumer 及同 fixtures parity 的完整消费链路未全部覆盖。

#### C4 Vue 生命周期与响应式来源 — partial

原动作：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
原最低场景：替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。

**已证结论**：真实 effectScope 停止后释放 latest handle，SSR 不激活 handle，getter/ref 及深 options 更改已验证局部。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:112–234`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/__tests__/use-search.spec.ts:124–202`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/__tests__/use-search.spec.ts:345–405`（read-implementation）

**必要缺口 / 不能核销原因**：缺真实 SFC 多实例挂卸与旧 core 查询晚到的完整组合；scope 测试不冒充完整 UI。

#### C5 Vue 类型与 SFC 消费 — partial

原动作：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。
原最低场景：vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。

**已证结论**：公开返回字段与基线 lint/typecheck 已核对。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:69–93`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/index.ts:1–16`（read-implementation）

**必要缺口 / 不能核销原因**：vue-tsc SFC consumer、模板错误、readonly/computed 来源和独立 pack 声明消费尚缺。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 14 个全范围文件已登记，10 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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
