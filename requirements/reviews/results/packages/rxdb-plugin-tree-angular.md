---
kind: review-execution
object: rxdb-plugin-tree-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-plugin-tree-angular：实际评审执行记录

**当前分轴（2026-10-05口径审计）：** 原范围全文审阅与逐C意见交付已完成；完整专题证据仍部分闭合，修复/发布未宣称完成。旧 `execution` 不再单独充当总代码评审完成度；见 [四轴进度审计](../../progress-2026-10-05.md)。

**最新 R2-02：16/16 受控文件全内容实读，原完整 C 0/5；🟡 部分完成，待主控补证。** 新probe/consumer只交付定义，不借历史通过。下面第一轮/启动批为历史，最新逐C与完成条件见末节。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular：Tree repository 的响应式查询与加载状态封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-tree-angular/src/use-tree.ts`](../../../../packages/rxdb-plugin-tree-angular/src/use-tree.ts)
- [`packages/rxdb-plugin-tree-angular/src/index.ts`](../../../../packages/rxdb-plugin-tree-angular/src/index.ts)
- [`packages/rxdb-plugin-tree-angular/package.json`](../../../../packages/rxdb-plugin-tree-angular/package.json)
- [`packages/rxdb-plugin-tree-angular/project.json`](../../../../packages/rxdb-plugin-tree-angular/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 树查询与输入类型：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。
- [ ] C2 增量结果与参数切换：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。
- [ ] C3 三端 contract 与泄漏：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。
- [ ] C4 Angular 生命周期与注入：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
- [ ] C5 Angular 类型与运行证据：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 第一轮历史交付（由 R2-02 更新阅读完成度）

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-tree-angular` 的 16 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：5 个文件有正文片段、0 个仅测试 outline、0 个仅导航锚点、11 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                 | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 3 passed (3)；Tests 7 passed (7)                                           | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 9120–9161；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 100% / 100% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 6 个包内文件，declared entries 缺失 0；root 解析通过                                  | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `dist/packages/rxdb-plugin-tree-angular`；未执行 typed consumer/runtime import                                                                          |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

四个函数只挑静态仓储方法名与默认值，没有第二套 query 状态机。生命周期和错误归属对应 rxdb framework useRepositoryQuery；Tree 插件拥有层级/QueryCache/移动语义。当前 fixture 是手写 TreeEntity/static method mock，不是深树 SQL 或 numeric-id consumer。

### 逐 C 结论（原场景没有缩小）

#### C1 树查询与输入类型 — partial

原动作：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。
原最低场景：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。

**已证结论**：四个入口逐个对齐方法名/defaultValue（数组 []、计数 0）与 EntityStaticType 参数；只委托本框架 useRepositoryQuery，不存在扁平查询 fallback。；泛型 fixture 有 PlainEntity 编译期拒绝及树实体接受，但 id 实际都是 string，不能拿它证明 numeric id。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/use-tree.ts:23–81`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/use-tree.spec.ts:53–110`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/tri-framework-generics.spec.ts:21–77`（read-implementation）

**必要缺口 / 不能核销原因**：缺 numeric id 实际查询、无 Tree 插件、QueryCache 禁止组合及深树真实仓储链路；四个同名 mock method 不能替代这些原场景。

#### C2 增量结果与参数切换 — partial

原动作：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。
原最低场景：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。

**已证结论**：wrapper 没有自己的 query state/订阅；订阅切换和错误全部由已读 useRepositoryQuery 承担，React/Vue 有代次屏障，Angular effect cleanup 释放旧订阅。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-angular/src/hooks.ts:45–124`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/use-tree.spec.ts:53–110`（read-implementation）

**必要缺口 / 不能核销原因**：没有在树 wrapper 上运行跨父移动、父删除、快速改 query、空树与销毁同 fixture；状态模型源码相同不等于真实树增量结果已复验。

#### C3 三端 contract 与泄漏 — partial

原动作：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。
原最低场景：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。

**已证结论**：三端四个运行时根导出、输入泛型/资源返回结构一致，类型参数均收紧为 TreeEntityType；计数默认值已动态断言。；已实际读取三端 README 的调用形式、原生成/控制来源是 scope 中的手写 class fixture，不是后台生成的 consumer。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/index.ts:14–14`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/tri-framework-generics.spec.ts:21–77`（read-implementation）

**必要缺口 / 不能核销原因**：缺同一真实 tree fixture 的三端状态/多实例泄漏对照及独立 typed consumer；pack root resolve 不证明声明可消费。

#### C4 Angular 生命周期与注入 — partial

原动作：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
原最低场景：切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。

**已证结论**：已追溯到框架核心的 cleanup/代次实现，不在 thin wrapper 另建订阅。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-angular/src/hooks.ts:45–124`（read-implementation）

**必要缺口 / 不能核销原因**：Angular 缺真实组件 input/provider override/route；React wrapper 套件没有 StrictMode 与多 root；Vue 套件仅 effectScope，没有真实 SFC props 深改/挂卸/晚到组合。

#### C5 Angular 类型与运行证据 — partial

原动作：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。
原最低场景：typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。

**已证结论**：现有 workspace typecheck 编译正反泛型 fixture，基线 lint 无警告；没有因为 inject/use 命名差异误报。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/use-tree.ts:23–81`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/tri-framework-generics.spec.ts:21–77`（read-test-definition）

**必要缺口 / 不能核销原因**：现有 fixture 不是独立声明 consumer；Angular 模板错误/route、React 同值新引用和错误 props 渲染、Vue vue-tsc/readonly/SFC pack 消费不能由 root resolve 和类型 fixture 自动补齐。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 16 个全范围文件已登记，11 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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

## 2026-10-05 R2-02：全范围与原C局部核销（最新）

基线 `76a3848e2086f4617b80f7b1a1b896ef76e5719c`，更新时间`2026-10-05T11:13:46.687238+08:00`。16/16受控文件全内容实读，未读0、scope SHA漂移0；另增一个8例spec。不改实现/原tests/依赖。源码🟢薄封装；全对象🟡partial，原完整C仍0/5、完整对象候选false、评审完成/发布就绪均false。

### 生产锚点与实际read范围

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/use-tree.ts:23–81` 的四个`use*`只委托`useRepositoryQuery`，method/default/options固定，无额外订阅、扁平fallback或DI选库。README/TSDoc与Signal调用一致。
- `EntityStaticType`与`ENTITY_STATIC_TYPES`：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb/src/entity/entity.interface.ts:31–90`；生成器四个`addStaticMethod`采用`FindTreeOptions<typeof Class,TreeRuleGroup>`：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/generator/TreeRepositoryGenerator.ts:99–150`。`FindTreeOptions.entityId`取idType、level真实校验，`TreeRepository.#normalizeOptions`用`?? null`保留0：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts:65–131`。原string手写fixture不能自动背书numeric，但本轮实际core ID0和独立正负consumer已补局部证据。
- `useRepositoryQuery.queryEffect`/`onCleanup`/`track`/`toLazySignal`：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-angular/src/hooks.ts:45–124`；`QueryManager.#create_result_stream`最后observer→task.clean：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb/src/repository/QueryManager.ts:349–376`。Entity静态method按EntityType解析manager，不是hook注入provider重绑定同一class；provider probe用不同库各自实体类。
- 三端index/use-tree/原generics正文实读。四入口、TreeEntityType、静态options槽、[]/0一致。Angular Signal、React值、Vue reactive值与Ref选项保留原生表达，不强行完全同类型。静态对称不是同fixture三端动态证据。
- 16受控文件均非生成源码；ng-packagr entryFile与resolved publishRoot追到实际dist d.ts/FESM，source map81行与当前wrapper相同，README/LICENSE相同。当前生产build也已过。旧manifestpeer ^22.1.6的时代边界保留历史；新产物peer22.2.1。源manifest无exports不是发布缺失。

### 主控实际测量回写（不得平均成绿）

| 测量                        | 结果                                                                    | 边界/证据                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 独立tar typed consumer bare | valid exit2，invalid含上游及consumer错                                  | utils public.d.ts缺NodeJS及ms声明，保留`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation-bare.json`，不是tree调用错误                                                                                                                                                                                         |
| 显式ambient对照             | strict=true、skipLibCheck=false；valid0，invalid exit2且仅第5/9行TS2322 | 显式node+@types/ms 2.1.0；无paths/源码alias/库内部import，fixture SHA匹配；`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-ambient-types.json`；不是公开声明裸环境自包含通过 |
| Node runtime root import    | exit0，四个运行时导出齐全                                               | Angular compiler显式bootstrap；`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/consumer-rxdb-plugin-tree-angular-root-import.txt`；不是路由/浏览器全链路                                                                                                                                                                                 |
| 当前生产build               | exit0，禁本地/远程cache，输入测量漂移0                                  | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-build-status.json`；日志本包637–659，head465f9078                                                                                                                                                                                                                   |
| 当前unit初版probe           | 4文件/15例：13过2失败；新增8例6过2fixture失败，原7过，skip0             | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt:967–1048`；TSprogram warning，新组件signal authoring input没有JIT metadata，setInput NG0303后NG0950                                                                                                                                               |
| 当前四覆盖率                | statements/branches/functions/lines=100/100/100/100，各项≥80%           | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage/rxdb-plugin-tree-angular/coverage-summary.json`；仅8语句/8行/4函数/0分支，不抹unit失败                                                                                                                                                                |
| 初版probe lint              | exit0，max-warnings0，禁缓存、测量漂移0                                 | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-lint-status.json`；之后只修新Input fixture，因此修后lint/typecheck/focused unit仍请求主控                                                                                                                                                                           |

原7例与第一轮100%仍是历史局部，不冒充新HEAD全绿。新的单位测量与consumer均由主控执行，本代理只读日志和修新增fixture，不自行跑test/build/coverage/e2e/server/容器。

### 原 C 与最低场景逐条结论

#### C1 树查询与输入类型 — partial（完整C不核销）

原动作：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。

原最低场景：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。

真实core注册护栏、错误透明、ID0/lazy已测；独立numeric/string类型消费在显式环境下通过。缺真实SQL深树/数据查询最低场景，原C仍partial。

- **numeric/string id**：`partial-dynamic-and-typed-pass`。ID=0实际core查询新probe已通过；string历史派发；独立tar numeric/string valid0及numeric/string负例两处TS2322在显式node+@types/ms下已测。 真实numeric/string SQL树数据对比与深树。；必要动作 R2-02-V1, R2-02-V2T, R2-02-V3, R2-02-V5。
- **缺 Tree 插件**：`pass-core-boundary`。真实EntityManager.init按仓储登记拒绝缺TreeRepository；没有核心扁平fallback。 不替代SQL深树场景。；必要动作 R2-02-V1。
- **QueryCache 禁止**：`pass-core-boundary`。RxDBPluginTree.install声明unsupportedSyncTypes.QueryCache，核心按生效配置校验。 不替代SQL深树场景。；必要动作 R2-02-V1。
- **深树/层级/懒查询**：`partial-lazy-pass`。四方法惰性、数值0/参数归一/非法level已在真实core边界新probe通过。 真实SQL深树及level省略/0/1的数据断言。；必要动作 R2-02-V1, R2-02-V5。
- **错误透明，不 fallback 到扁平查询**：`pass-core-boundary`。四个wrapper固定tree method；上游useRepositoryQuery缺方法/subscribe抛错与error走setFailure，无普通find查询；新probe透传真实normalize非法level错误。 不替代SQL深树场景。；必要动作 R2-02-V1。

#### C2 增量结果与参数切换 — partial（完整C不核销）

原动作：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。

原最低场景：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。

真实core源码归属明确；快速input/空态/销毁组件probe初次失败属于JIT input fixture，修复后未复跑；跨父移动/父删除live-vs-full未验，原Cpartial。

- **跨父移动**：`unverified`。TreeRepository构造注册tree merge；wrapper无第二增量状态机。 同一真实SQL fixture的live结果与全量结果一致。；必要动作 R2-02-V5。
- **父删除**：`unverified`。 真实删除后子树/祖先live结果与全量查询的联动。；必要动作 R2-02-V5。
- **快速改 query/新父或过滤条件不串旧结果**：`initial-fixture-failed-corrected-replay-pending`。Angular effect cleanup在options依赖改动时unsubscribe旧task。 SQL实时变更/过滤条件和树移动时的live对照。；必要动作 R2-02-V1, R2-02-V5。
- **空树**：`initial-fixture-failed-corrected-replay-pending`。 fixture的空数组边界不是真实持久化空树。；必要动作 R2-02-V1, R2-02-V5。
- **销毁/与全量查询一致**：`partial`。wrapper所有权委托；effect cleanup与QueryManager最后observer清理成对；新probe计数到零并晚拒绝。 新probe执行和真实树更新后的全量一致性。；必要动作 R2-02-V1, R2-02-V5。

#### C3 三端 contract 与泄漏 — partial（完整C不核销）

原动作：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。

原最低场景：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。

静态三端对称与独立typed/runtime根消费（显式Node+types/ms条件）已证；bare上游风险保留，同一真实fixture三端动态和组件多资源未齐，原Cpartial。

- **公共返回类型/输入泛型三端一致**：`static-pass`。三端四个同名导出/TreeEntityType/options静态槽/[]或0一致。Angular返回Signal字段，React值字段，Vue reactive值字段；native用法差异不是API缺失，Vue支持Ref是原生扩展。 ；必要动作 静态对照已证。
- **同一 tree fixtures 三端运行、loading/error/empty**：`partial`。三端原generics正文与public roots已对照，历史单位只是各端同形mock；新增本端core组件probe。 相同输入与状态序列的真实tree fixture三端动态对照。；必要动作 R2-02-V4。
- **consumer 编译，无内部路径消费**：`pass-with-explicit-ambient-control-bare-upstream-failed`。独立实际tar安装的d.ts，strict=true skipLibCheck=false无paths：显式node+@types/ms下valid0/invalid两处TS2322，root runtime import0，SHA匹配本目录fixtures。 不证明裸公开声明自包含；bare utils TS2503/TS7016风险保留。模板/route另列。；必要动作 R2-02-V3。
- **多实例/泄漏**：`provider-multi-instance-pass-component-duplicate-query-replay-pending`。两个真实数据库/父子injector资源独立与cleanup归零已测；同组件两资源probe初次metadata失败，修fixture待重跑。 其他两端相同fixture动态、多root/真实挂卸证据归各对象主控；本对象不代审。；必要动作 R2-02-V1, R2-02-V4。

#### C4 Angular 生命周期与注入 — partial（完整C不核销）

原动作：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。

原最低场景：切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。

context和父子provider/独立库cleanup已测；两组件probe初次NG0303/NG0950，已只修新fixture但待focused重跑，不算业务缺陷也不算场景通过。

- **注入上下文/standalone/OnPush**：`context-dynamic-pass-component-input-fixture-replay-pending`。四入口无context拒绝已测；standalone/OnPush组件初次因JIT没有signal authoring input metadata而失败，现仅新spec修成Input required setter+signal，待重跑。 ；必要动作 R2-02-V1。
- **切换 inputs**：`initial-fixture-failed-corrected-replay-pending`。 ；必要动作 R2-02-V1。
- **销毁中异步完成**：`initial-fixture-failed-corrected-replay-pending`。 ；必要动作 R2-02-V1。
- **子 provider 覆盖/无跨库状态**：`pass-core-boundary`。真实父子RxDB provider、各自EntityType、结果不串、子销毁不撤父订阅与最后订阅归零，new probe已测通过。 ；必要动作 R2-02-V1。
- **同组件多实例/无订阅泄漏**：`initial-fixture-failed-corrected-replay-pending`。useRepositoryQuery effect cleanup、toSignal DestroyRef及QueryManager observer最后清理已实读。 ；必要动作 R2-02-V1。

#### C5 Angular 类型与运行证据 — partial（完整C不核销）

原动作：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。

原最低场景：typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。

严格独立d.ts正负消费在显式Node+types/ms下有效；bare上游utils问题未掩盖；真实组件错误空态probe需重跑，ngc输入事件反例/真实route未验。

- **typed consumer 编译/泛型推导**：`pass-with-explicit-ambient-control-bare-upstream-failed`。独立实际tar安装的d.ts，strict=true skipLibCheck=false无paths：显式node+@types/ms下valid0/invalid两处TS2322，root runtime import0，SHA匹配本目录fixtures。 不证明裸公开声明自包含；bare utils TS2503/TS7016风险保留。模板/route另列。；必要动作 R2-02-V2T, R2-02-V3。
- **模板事件/输入错误**：`unverified`。tsconfig严格模板配置和真实component positive定义；它们不是ngc negative证据。 独立strictTemplates正例和错误input/event编译拒绝（不能拿ID TS反例替模板反例）。；必要动作 R2-02-V3。
- **错误与空态**：`initial-fixture-failed-corrected-replay-pending`。 ；必要动作 R2-02-V1。
- **真实 route 挂载/卸载**：`unverified`。 EnvironmentInjector与TestBed组件销毁不等于真实router/browser route；需route挂卸重复后状态/订阅、晚到不写已卸载组件。；必要动作 R2-02-V3。

### 新probe修复仅限fixture，失败记录不删

`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/review-round2-core-lifecycle.spec.ts` 原8例有6例通过：真实缺插件、QueryCache、注入上下文、非法level、ID0四入口lazy/资源、父子provider/独立库cleanup。两组件先被analog warning标为“不在TS program”，signal authoring `input.required()`没有Angular编译产生的输入metadata；JIT无法`setInput`，发生NG0303/NG0950。

现只把新fixture改成公开`@Input({required:true})` setter驱动signal，standalone/OnPush/输入切换/两资源/错误空态/晚到/销毁的断言全部保留。没有修改包实现、原tests、vite、依赖或使用内部ɵAPI绕过。**修后未复跑**，不能将两红判为业务缺陷，也不能将它们判为通过。主控focused重跑请求已更新，不等待无关all73后端。

### 原全对象完成条件

D1. **全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。** — `pass`：16/16范围全内容实读，scope SHA全部相符；另增一必要spec，不混入原16。

D2. **每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。** — `pass-for-accounting-not-semantic-closure`：5/5明确结论与原场景补证动作；完整C为0/5，没有不适用或删要求。

D3. **不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。** — `pass-for-source-and-honest-separation`：生产锚点、旧测量与新probe定义分离；新动态通过未主张。

D4. **实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。** — `partial`：本轮build通过、旧版probe lint零警告；本轮15例13过2fixture失败，四指标100/100/100/100不抹unit红；修复仅新spec待focused重跑/typecheck/lint。consumer条件性正负/runtime已登记。

D5. **上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。** — `partial`：本包/core/三端API对照与独立d.ts+runtime根消费在显式ambient环境通过，bare utils风险保留；三端相同fixture动态、SQL树、模板/route待验。

D6. **确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。** — `pass-no-new-confirmed-finding`：去重registry未命中本包；无新候选/不重复编号；未验证项全列主控请求。

D7. **形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。** — `partial-overall-review-not-complete`：本包源码封装🟢；全对象🟡partial-awaiting-validation，不宣称评审完成或发布就绪。

### 结论、归属与剩余动作

全对象 **🟡partial，完整C0/5**。未测原场景不写不适用；主控可最终裁定合理分流，不等上游代码修复。没有新增tree业务确认问题，不重复RV-066/067/068或其他对象编号。裸strict声明环境风险归上游`@aiao/utils`并保留；修fixture的两红、四指标、初版lint分别登记，不拼成单一稳定全绿HEAD。

剩余动作：本包修fixture的focused unit/lint/typecheck；真实SQL的numeric/string深树、跨父移动/父删除live-vs-full；同fixture三端动态；ngc模板输入/事件错误和真实route挂卸。具体只限原C，不开新发现大组。

机器交付：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/closure.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/changed-files.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/file-inspection.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/c-evidence.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/validation-observations.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/validation-requests.json`。Consumer定义/结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-valid.mts`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-invalid.mts`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-fixtures.json`。工具/去重/fixture边界：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/angular-tool-observations.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/findings.pending.md`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/spec-design.md`。最新R2覆盖前文历史11未读，不篡改旧测量。

### 原required-input场景不得由替代夹具核销（最终补充）

初版**已证**的是TestBed/JIT未识别输入（NG0303）导致绑定失败，随后读空required signal（NG0950）；**未证**的是正确ngc编译并正确父模板绑定后生产是否仍可达、最终根因归属。此前倾向fixture编译边界的判断仅是证据解释，不是生产不可达结论。setter+signal(0)只恢复其他生命周期测量，不核销原input.required场景。

原夹具快照 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/probe-original-required-input.spec.ts.txt`，SHA `2859c2fb42ac2232b003b8b05302fa441686139a73a8d7da13e7e820c8838c21`，与主控实际测量SHA匹配=True；原日志保留不删除。独立 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-required-input.mts` 保持 `input.required<number>()` 和tree hook options getter，父组件 `RequiredInputHost` 用模板显式 `[rootId]="rootId()"` 绑定。需主控ngc编译与运行0→7、无NG0303/NG0950对照，R2-02-V6，尚未执行。它不替typed tsc、SQL、route，也不把C4/全对象绿化。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。

## R3-01 Angular 模板补证结算（2026-10-05；仅建议，主控裁定）

本有界任务的最小正反对照已交付；**不修改原C状态/全对象评级/发布结论**。源码全文审阅与逐C意见交付沿用R2记录，专题证据核销、发布/设备验证分开；不把剩余运行场景未核销写成“未评审”。[补证总账](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/report.md)、[全部真实命令/退出/诊断/断言](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/settlement.json)、[现场manifest与声明](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/onsite-package-declarations.json)。

消费版本现场逐项读取：core、tree/search核心与两Angular wrapper 0.0.26，`@aiao/rxdb-angular` **0.0.27**；Angular/compiler-cli 22.2.1、TS6.0.3、RxJS7.8.2。六个已安装包逐文件匹配R2真实tar。真实公开入口，无workspace业务alias、fake input、deps改动。官方规范另存；只用真实compiler-cli.performCompilation与fixture-only虚拟CompilerHost，不冒称CLI入口或v21例子是Nx根。

严格`.ts` ngc正例0诊断，6反例组退出1合计8诊断，strict/strictTemplates=true、skipLibCheck=false。`.mts`尝试意外接收错输入/错事件的四条退出0日志保留，不用于模板核销；最终`.ts`产物字节镜像为`.mjs`，不改manifest/压制warning。31项命令全经指定共享锁串行；71个scope文件无漂移，最终6662个安装文件无漂移。没有Nx heavy task/cache绿、全量build/test、GUI/容器，未新建packages测试文件。

### tree：正确父模板与JIT红严格分开

- [同源父/子消费者](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/fixtures/consumer.ts) 中是真正`input.required<number>()`，Angular AOT元数据rootId flag=1；父`[rootId]="rootId()"`直接绑定，**不用setInput/setter**。
- [AOT运行](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/runtime-tree-aot-ts-final.json)：退出0、14断言。root=0/level=1到四helper；父signal快切1→2；旧promise不覆盖；numeric输出；loading/empty/error渲染；销毁四primary$订阅归零。
- [同源TS-only/JIT原式运行](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/runtime-tree-jit-unbound-ts-final.json)：退出1、成功断言0；input元数据为空，先NG0303拒绝setInput，后NG0950。结合绿对照，建议原R2这条红归该JIT未绑定夹具边界，**不是正确父模板产品失败证据，更不是tree全产品无缺陷证明**。R2原探针/原红及setter对照均保留未改。
- ngc tree三反例分别退出1：缺rootId→NG8008；string输入→TS2322；number输出传string处理器→TS2345（各1诊断）。[编译正例](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/compiler-consumer-ngc-final.json)及`compiler-tree-*-ngc-final.json`保存声明路径/原诊断。

### 原C建议与未证边界

仅建议将C4的正确父绑定/输入换代/清理、C5的模板正反与上述组件渲染子面补入动态证据；不改原C核销。真实route/native browser、真实SQL及同fixture三端结论归主控。

**主控最新报告的真实PGlite风险必须保留**：另行三端同fixture在锚点删除后count=-1，已定位PGlite `count(*)-1`，SQLite对应clamp0，候选RV079准备由主控确认；本次结算时尚未观察到该RV文件。证据/编号归主控，不在本任务登记。这里backend count=0是受控协议接缝，不能证明仓储count正确，**tree C1/C2不能宣称真实仓储全绿**，C3数据/count三端语义也由主控裁定。没有覆盖率/发布就绪外推。
