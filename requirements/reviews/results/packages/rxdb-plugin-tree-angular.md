---
kind: review-execution
object: rxdb-plugin-tree-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-tree-angular：实际评审执行记录

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

## 2026-10-05 R2-02：全范围实读、真实 core 契约与闭环边界（最新）

基线 `465f9078e9844af2cbef9936c7321a5576333a01`，记录时间 `2026-10-05T11:06:04.266015+08:00`。原16受控文件 **16/16全内容实读，未读0，scope SHA变化0**。另外新增1个必要spec（8个用例定义），不改变原16盘点，不改实现/原tests/依赖。当前Angular22.2.1、Nx23.2.1、TS6.0.3、Node26.7.0、pnpm10.34.6。

### 生产不变量与完整阅读结论

- **🟢 四个wrapper是薄委托。** `useFindDescendants/useCountDescendants/useFindAncestors/useCountAncestors` 只有method/default/options，固定委托 `useRepositoryQuery`；没有额外订阅、fallback、DI数据库选择或树增量状态机。TSDoc与README的默认数组/计数和Signal调用一致。生产锚点 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/use-tree.ts:23–81` 与桶导出 `src/index.ts:14`。
- **真实泛型来源，而非手写mock背书。** `EntityStaticType`取生成实体的`ENTITY_STATIC_TYPES`，`FindTreeOptions.entityId`取`idType`、`level`由真实`TreeRepository.#normalizeOptions`校验。numeric=0经`?? null`保留；生成器四个`addStaticMethod`都采用`FindTreeOptions<typeof Class,TreeRuleGroup>`。源锚点 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb/src/entity/entity.interface.ts:31–90`、`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts:6–36`、`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/generator/TreeRepositoryGenerator.ts:99–150`。原generics fixture仅string，不能证明numeric运行。
- **生命周期由真实core与Angular负责。** `useRepositoryQuery.queryEffect`依赖options getter，注册`onCleanup(unsubscribe)`；`toLazySignal`捕获injector、首读建立`toSignal`，状态字段`track`也首读启动；`QueryManager.#create_result_stream`最后observer调用`task.clean()`。锚点 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-angular/src/hooks.ts:45–124`、`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb/src/repository/QueryManager.ts:349–376`。静态entity method按EntityType解析manager，并非hook读取当前RxDB provider自动换库；probe父子用各自实体类，不能把provider覆盖误作重绑定同一class。
- **三端静态契约🟢。** 直接读取React/Vue的index/use-tree/原generics正文：四入口、TreeEntityType、四静态options槽、数组/number/default一致；Angular字段为Signal，React值字段，Vue reactive值字段及Ref选项是原生表达差异，不是缺API。未拿静态对称替三端动态对照。
- **发布入口来源明确。** `ng-package.entryFile=src/index.ts`、resolved build为`@nx/angular:package`，publishRoot=`dist/packages/rxdb-plugin-tree-angular`；实际产物d.ts/FESM四声明一致、source map含81行wrapper且等于当前源码，README/LICENSE也相同。源manifest无exports不是缺发布入口。旧产物peer ^22.1.6与当前源精确22.2.1存在时代边界，需主控新build，不能称fresh HEAD发布验证。

### 本轮新增证据定义（尚未执行）

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/review-round2-core-lifecycle.spec.ts`：8例。真实RxDB/plugin/EntityManager/TreeRepository/QueryManager；仅`primary$`为可控适配器Promise边界。真实注册期缺插件/QueryCache、非法level、四方法懒启动/ID=0、standalone/OnPush必填input快速切换、晚到旧结果、多资源、loading/empty/error DOM、销毁晚失败、父子provider与订阅归零。不是SQL树持久化、真实浏览器或route。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-valid.mts`：真实根包imports、numeric/string树基类与静态槽、四hook返回signals精确类型，无paths/断言/any。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-invalid.mts`：仅第5行string传numeric-ID、第9行number计数作为string返回。期待两条TS2322，由主控从真实tar编译确认；无`ts-expect-error`遮错。
- Angular CLI只发现examples（21）而非本Nx包；best-practices两次与documentation一次均`Unexpected response type`，不阻断只读、不跑错误workspace。用本地22.2.1官方effect声明核对DestroyRef/onCleanup/injection，工具限制另见angular-tool-observations.json。

### 逐原 C 结论（最低场景不缩小）

#### C1 树查询与输入类型 — partial，原完整C未核销

原动作：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。

原最低场景：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。

结论：静态类型/固定派发/参数层级与注册护栏链路明确，新增真实core边界探针与numeric/string消费者；尚缺其执行和真实SQL深树，原C不核销。

- **numeric/string id**：`partial`；源泛型/真实FindTreeOptions按idType推导；历史string mock派发，numeric=0真实core probe与独立numeric/string consumer已准备。 numeric/string SQL实际查询与数据对比；numeric probe/consumer尚未执行。 补证：R2-02-V1, R2-02-V2T, R2-02-V3, R2-02-V5。
- **缺 Tree 插件**：`source-confirmed/dynamic-pending`；真实EntityManager.init按仓储登记拒绝缺TreeRepository；没有核心扁平fallback。 补证：R2-02-V1。
- **QueryCache 禁止**：`source-confirmed/dynamic-pending`；RxDBPluginTree.install声明unsupportedSyncTypes.QueryCache，核心按生效配置校验。 补证：R2-02-V1。
- **深树/层级/懒查询**：`partial`；wrapper原样options；TreeRepository.#normalizeOptions不传level不限层，0不误判；新probe证明四资源在read前无subscription、状态read能启动（待执行）。 真实深树level省略/0/1结果及完整SQL链路。 补证：R2-02-V1, R2-02-V5。
- **错误透明，不 fallback 到扁平查询**：`source-confirmed/dynamic-pending`；四个wrapper固定tree method；上游useRepositoryQuery缺方法/subscribe抛错与error走setFailure，无普通find查询；新probe透传真实normalize非法level错误。 补证：R2-02-V1。

#### C2 增量结果与参数切换 — partial，原完整C未核销

原动作：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。

原最低场景：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。

结论：参数切换、错误与订阅归属已追到真实Angular/core源码，新增组件晚到/空态/销毁探针；跨父移动/父删除的live-vs-full未验，原C不核销。

- **跨父移动**：`unverified`；TreeRepository构造注册tree merge；wrapper无第二增量状态机。 同一真实SQL fixture的live结果与全量结果一致。 补证：R2-02-V5。
- **父删除**：`unverified`；真实删除后子树/祖先live结果与全量查询的联动。 补证：R2-02-V5。
- **快速改 query/新父或过滤条件不串旧结果**：`probe-ready-not-executed`；Angular effect cleanup在options依赖改动时unsubscribe旧task。 SQL实时变更/过滤条件和树移动时的live对照。 补证：R2-02-V1, R2-02-V5。
- **空树**：`probe-ready-not-executed`；fixture的空数组边界不是真实持久化空树。 补证：R2-02-V1, R2-02-V5。
- **销毁/与全量查询一致**：`partial`；wrapper所有权委托；effect cleanup与QueryManager最后observer清理成对；新probe计数到零并晚拒绝。 新probe执行和真实树更新后的全量一致性。 补证：R2-02-V1, R2-02-V5。

#### C3 三端 contract 与泄漏 — partial，原完整C未核销

原动作：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。

原最低场景：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。

结论：四入口/泛型/默认值和原生资源字段静态对称；同一真实fixture三端动态、独立消费者/多实例实测未齐，原C不核销。

- **公共返回类型/输入泛型三端一致**：`static-pass`；三端四个同名导出/TreeEntityType/options静态槽/[]或0一致。Angular返回Signal字段，React值字段，Vue reactive值字段；native用法差异不是API缺失，Vue支持Ref是原生扩展。 补证：静态对照已记录。
- **同一 tree fixtures 三端运行、loading/error/empty**：`partial`；三端原generics正文与public roots已对照，历史单位只是各端同形mock；新增本端core组件probe。 相同输入与状态序列的真实tree fixture三端动态对照。 补证：R2-02-V4。
- **consumer 编译，无内部路径消费**：`fixtures-ready-not-executed`；发布根与真实tar旧root resolve；本目录consumer根包imports与79行valid、10行invalid已交付。 独立tar安装后valid=0、invalid两处TS2322与runtime import实际结果。 补证：R2-02-V3。
- **多实例/泄漏**：`probe-ready-not-executed`；其他两端相同fixture动态、多root/真实挂卸证据归各对象主控；本对象不代审。 补证：R2-02-V1, R2-02-V4。

#### C4 Angular 生命周期与注入 — partial，原完整C未核销

原动作：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。

原最低场景：切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。

结论：生命周期生产链完整实读，8例中覆盖context/input/销毁晚到/子provider/多实例；尚未收到新probe执行，不把test-definition当test-pass。

- **注入上下文/standalone/OnPush**：`static-pass/dynamic-pending`；上游effect/toLazySignal需要injection context；新增fixture显式standalone/OnPush、signals、@if/@for。 补证：R2-02-V1。
- **切换 inputs**：`probe-ready-not-executed`； 补证：R2-02-V1。
- **销毁中异步完成**：`probe-ready-not-executed`； 补证：R2-02-V1。
- **子 provider 覆盖/无跨库状态**：`source-confirmed/probe-ready`；hook查询目标是显式EntityType静态方法，不自行inject RxDB；父子probe用各自实体类和真实RxDB provider，子销毁不撤父订阅。 补证：R2-02-V1。
- **同组件多实例/无订阅泄漏**：`probe-ready-not-executed`；useRepositoryQuery effect cleanup、toSignal DestroyRef及QueryManager observer最后清理已实读。 补证：R2-02-V1。

#### C5 Angular 类型与运行证据 — partial，原完整C未核销

原动作：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。

原最低场景：typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。

结论：strict配置、泛型fixture及真实standalone组件定义已读，正负独立consumer已写；typed/runtime/strictTemplates反例/真实route未验，原C不核销。

- **typed consumer 编译/泛型推导**：`partial`；历史workspace正反fixture，当前consumer准备精确numeric/string+四返回Signal；不使用断言/any/ts-expect-error。 新独立tar consumer编译/负错代码核对。 补证：R2-02-V2T, R2-02-V3。
- **模板事件/输入错误**：`unverified`；tsconfig严格模板配置和真实component positive定义；它们不是ngc negative证据。 独立strictTemplates正例和错误input/event编译拒绝（不能拿ID TS反例替模板反例）。 补证：R2-02-V3。
- **错误与空态**：`probe-ready-not-executed`； 补证：R2-02-V1。
- **真实 route 挂载/卸载**：`unverified`；EnvironmentInjector与TestBed组件销毁不等于真实router/browser route；需route挂卸重复后状态/订阅、晚到不写已卸载组件。 补证：R2-02-V3。

### 门禁与测量：历史可复用，不冒充新spec通过

- 第一轮实际单包unit：3文件/7例通过，skip0；`framework-editor-coverage.txt:9120–9162`。原四mock只断言派发；没有原默认计数值/cleanup断言。历史文本包含本包setup及外部Angular装饰器不在TS program的warning；不隐藏、不登记成新业务bug。该包历史证据目录没有JUnit，不能假造。
- 第一轮v8四指标100/100/100/100，分母仅8语句、8行、4函数、0分支，各项≥80%。当前14个业务测量输入（源码/tests/config）SHA与旧记录一致，但新8例不在其中，依赖/HEAD也不能假冒固定。
- 历史禁缓存strict lint/typecheck batch包含本包、exit0、测量中输入漂移0，baseline44de1138；覆盖率batch全局exit1不改成本包失败，也不宣称全局通过。
- 旧实际tar包6文件、缺entry0、独立root ESM resolve通过；未执行d.ts编译或runtime import。主控当前正在做新的tar消费，尚未收到结果。
- 本代理没有跑build/test/coverage/e2e/server/容器。只执行read-only `nx show project` 与只针对新增文件的Prettier；真实验证统一交主控。

### 原全对象完成条件逐条核销

D1. **全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。** — `pass`：16/16范围全内容实读，scope SHA全部相符；另增一必要spec，不混入原16。

D2. **每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。** — `pass-for-accounting-not-semantic-closure`：5/5明确结论与原场景补证动作；完整C为0/5，没有不适用或删要求。

D3. **不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。** — `pass-for-source-and-honest-separation`：生产锚点、旧测量与新probe定义分离；新动态通过未主张。

D4. **实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。** — `partial`：旧测量命令/禁缓存/无测量中漂移/7例/四指标/警告已登记；当轮新增spec的所有门禁待主控。

D5. **上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。** — `partial`：本包/core接口/三端根导出与泛型静态对照完成；同一fixture三端动态、typed/runtime/模板与route未齐。不扩大成其他对象审计。

D6. **确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。** — `pass-no-new-confirmed-finding`：去重registry未命中本包；无新候选/不重复编号；未验证项全列主控请求。

D7. **形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。** — `partial-overall-review-not-complete`：本包源码封装🟢；全对象🟡partial-awaiting-validation，不宣称评审完成或发布就绪。

### 本次结论与剩余动作

**🟡 全对象 partial；源码封装🟢，原完整C 0/5、完整对象候选false、评审完成false、发布就绪false。** 无新增本包候选缺陷；已去重registry，不重复RV-066/067/068及其他分流问题。测试多或wrapper 100%不能填平原SQL/三端/模板/route缺口，主控可以裁定合理分流，本代理不自行删需求。

最小剩余：主控运行新增8例及本包lint/typecheck/build/coverage；真实tar valid=0/invalid两处类型拒绝+runtime root import；同一numeric/string真实树fixture的深树/跨父移动/父删除live-vs-full；同一三端状态序列；ngc strictTemplates输入事件反例与真实route挂卸。

机器附件：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/file-inspection.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/c-evidence.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/validation-observations.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/angular-tool-observations.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/validation-requests.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-fixtures.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/spec-design.md`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/findings.pending.md`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/closure.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/changed-files.json`。最新R2结论覆盖前文历史“11未读”，不篡改历史测量。
