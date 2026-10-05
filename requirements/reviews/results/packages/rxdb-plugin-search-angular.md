---
kind: review-execution
object: rxdb-plugin-search-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-search-angular：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular：SearchHandle 的框架响应式输入、结果、状态与清理封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-search-angular/src/inject-search.ts`](../../../../packages/rxdb-plugin-search-angular/src/inject-search.ts)
- [`packages/rxdb-plugin-search-angular/src/index.ts`](../../../../packages/rxdb-plugin-search-angular/src/index.ts)
- [`packages/rxdb-plugin-search-angular/package.json`](../../../../packages/rxdb-plugin-search-angular/package.json)
- [`packages/rxdb-plugin-search-angular/project.json`](../../../../packages/rxdb-plugin-search-angular/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 SearchHandle 映射：逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。
- [ ] C2 快速输入与 options identity：核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。
- [ ] C3 三端类型与依赖闭合：对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。
- [ ] C4 Angular 生命周期与注入：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
- [ ] C5 Angular 类型与运行证据：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05 frameworks 并行评审：逐 C 实际交付

基线 `44de1138b4d396fc45d6e76ab60476c40fef2223`；唯一范围 `packages/rxdb-plugin-search-angular` 的 16 个受控文件，摘要与 scope.json 全部相符。**execution: partial；完整 C 核销 0/5，本对象不是完整完成候选。** 不把已证局部场景当作原完整 C。

阅读登记：3 个文件有正文片段、0 个仅测试 outline、0 个仅导航锚点、13 个未人工检查。正文登记不等价于全文件阅读；截断/函数范围及测试覆盖差别详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

### 当前动态证据（限定真实测量面）

| 门禁                     | 2026-10-05 已读取结果                                                                 | 证据 / 边界                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit                     | Test Files 3 passed (3)；Tests 22 passed (22)                                         | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt` 行 9058–9087；新增 review-parallel 不在此基线                                                                                                                      |
| 四项覆盖率               | statements / branches / functions / lines = 100% / 100% / 100% / 100%；要求各项 ≥ 80% | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json`；原 include/exclude、禁缓存、maxWorkers=1；达标但不代替 C 语义                                                                                                                |
| lint / typecheck         | 全 69 对象分别 exitCode=0；typecheck 含 51 依赖任务，输入无漂移                       | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`；新 spec 仍待 focused rerun |
| 实际 pack / root resolve | 6 个包内文件，declared entries 缺失 0；root 解析通过                                  | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json`；发布根 `dist/packages/rxdb-plugin-search-angular`；未执行 typed consumer/runtime import                                                                        |

全局框架/editor 队列是 22/23 通过，**本子任务范围为 18/19 通过**；唯 rxdb-angular 的 16 个 directive fixture/mock 边界失败。这里不借另外 4 个 editor 包的数据补足自身对象。

### 功能族、订阅生命周期与双向事件所有权

输入 query 是 consumer 所有；结果/state/error/hasMore 归属 core handle。重建先 unsubscribe/destroy 旧 handle；命令通过 active/ref 路由最新 handle。initialQuery 仅初次种子，不能当作 v-model/受控 query。Angular 清空 last 防二次 setQuery，Vue suppressedQuery 同样防 clear 回声；React clear 更新 queryRef。

### 逐 C 结论（原场景没有缩小）

#### C1 SearchHandle 映射 — partial

原动作：逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。
原最低场景：空词、无结果、查询失败、清空、末页；框架状态不能吞掉核心错误。

**已证结论**：已逐项核对 query/results/state/error/hasMore 及 loadMore/clear/retry 路由；旧套件通过。；Angular 既有 221–255 用真实 core handle 验证两页及末页；React/Vue 既有主体是 BehaviorSubject 句柄桩，不能算同一真实 core 场景。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:85–213`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/inject-search.spec.ts:78–164`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/review-parallel-real-handle.spec.ts:1–69`（owned-new-test-not-yet-run）

**必要缺口 / 不能核销原因**：三端同序列空词→无结果→失败→重试→末页→清空的真实 core handle 新探针已写，主控尚未补跑；因此不把 C1 提前核销。

#### C2 快速输入与 options identity — partial

原动作：核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。
原最低场景：A→B 快速输入、相同值新对象、换库/branch、并发翻页；不重复创建 handle 或串结果。

**已证结论**：source/options identity 的重建与当前 query 保留已有断言；initialQuery 只播种、不当作受控输入；语义等价对象不重建。；Vue 已实际读取并核对 options 深修改回归（pageSize/collections）；React snapshot 复制 collections；Angular 接受 Signal。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:91–183`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:85–213`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/inject-search.spec.ts:306–456`（read-implementation）

**必要缺口 / 不能核销原因**：缺 A→B 真正异步查询代次与 branch 变化并发翻页的三端同 fixture；既有桩 emission 隔离不等价于完整搜索后端时序。

#### C3 三端类型与依赖闭合 — partial

原动作：对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。
原最低场景：缺 plugin、typed consumer、同 fixtures parity、卸载；必须依赖能通过 inject 闭合。

**已证结论**：三端根入口同样透传 SearchExecutionError（运行时）、SearchHandle/SearchOptions/SearchResult/SearchState（类型）和 SearchSourceLike/UseSearchReturn。；已读取真实 pack 的发布根/入口清单及独立 root ESM resolve；没有拿 Angular 源 manifest 缺 exports 误报。；React README consumer 只定义函数、由本轮 workspace typecheck 编译；它没有启动数据库或挂载页面。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/index.ts:13–16`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:85–213`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/inject-search.spec.ts:210–219`（read-implementation）

**必要缺口 / 不能核销原因**：pack 证据未执行声明编译/runtime import；缺插件、backend 不支持、typed root consumer 及同 fixtures parity 的完整消费链路未全部覆盖。

#### C4 Angular 生命周期与注入 — partial

原动作：核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。
原最低场景：切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。

**已证结论**：EnvironmentInjector destroy 确实切断订阅、晚到桩结果不回写；Signal source/options 重建及最新 handle 销毁已有断言。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:85–213`（read-implementation）
  **实际读取的测试定义/新增探针**：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/inject-search.spec.ts:166–207`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/inject-search.spec.ts:438–455`（read-implementation）

**必要缺口 / 不能核销原因**：缺真实组件 input/子 provider 覆盖、组件多实例与 route 反复挂卸。

#### C5 Angular 类型与运行证据 — partial

原动作：核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。
原最低场景：typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。

**已证结论**：公开返回字段与基线 lint/typecheck 已核对。

**源码 / 类型锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:48–65`（read-implementation）
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/index.ts:1–16`（read-implementation）

**必要缺口 / 不能核销原因**：Angular 模板输入/事件错误与真实 route 尚缺。

### 全对象完成条件逐条判定

1. **全部受控文件清点：通过；全部内容阅读：partial。** 16 个全范围文件已登记，13 个仍未人工检查；不从 scope 默默删配置、fixture、README、资源。
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

## 2026-10-05 parallel-round2：最新实际收尾记录

阅读 HEAD `76a3848e2086f4617b80f7b1a1b896ef76e5719c`；记录 `2026-10-05T11:10:29.638149+08:00`；任务 R2-04 / scope R2-05 的标签差异已登记，唯一对象始终 `rxdb-plugin-search-angular`。

**17/17 原文件全文读取；本包代理源码/C文档交付完成，13个新增probe case冻结。execution 保持 partial；完整 C 0/5，reviewComplete=false、releaseReady=false、fullObjectCandidate=false。** 下文覆盖前轮“13文件未读”的当前状态，原历史记录不删除。必要缺口与主控在跑的验证如实保留，不等无关大包修复。

### 1. 生产所有权、错误、取消与泛型边界

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:85–98,125–166`：注入 DestroyRef/ErrorHandler；首个handle同步install，四core流直接写四只读Signal；query是唯一WritableSignal。
- 同文件168–192：source/options Signal语义变化时重建；旧订阅先unsubscribe/destroy，当前query作为seed；两个effect与最新handle归DestroyRef清理。
- 同文件203–211：commands走最新active；loadMore的拒绝不catch、不变成成功，clear去重防二次setQuery。recoverable SearchExecutionError由error$保持对象identity；协议流损坏只交ErrorHandler并解绑nextSubs。
- `useSearch/UseSearchReturn` 当前无实体泛型参数；SearchResult是跨collection归一metadata，不是虚构的RxDocument<T>。对原“泛型推导”要求按实际公开SearchSourceLike/Signal/返回签名与consumer检查落实，不增加any或断言掩盖错误。
- core取消/等待者的 **RV-062** 原问题仍只引用，Angular委托clear/destroy不代表任意pending loadMore Promise结算。新探针只处理已启动的分页，未复制造成该问题的success同步重入场景。

### 2. 已实读的实际证据与环境限制

| 测量                   | 实际结果                                                             | 必须保留的边界                                                                                          |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 历史unit               | 3 files / 22 tests passed，skip0                                     | 日志框架批9058–9087；source/core已测子集无漂移；不包含新的13例或late real-handle文件                    |
| 历史四指标             | S/B/F/L=100/100/100/100；阈值逐项80%                                 | v8 include src/**/*，65 statements/12 branches/17 functions/55 lines；不是当前扩充测试门禁              |
| late真实core C1        | 历史1 passed                                                         | 当前88行probe与实测SHA不同，不能继承为完整C1核销                                                        |
| 真实tar runtime root   | exit0，值导出SearchExecutionError/useSearch                          | Node侧显式预载Angular compiler；只import根，不在无inject上下文执行helper，也不是完整UI                  |
| 裸tar typed consumer   | valid与invalid均受utils NodeJS/ms声明错误影响                        | 保留原环境失败，不是consumer调用根因，也不是负例正确拒绝的充分证据                                      |
| 补充环境tar typed      | valid0；invalid2，五个TS2322/TS2345在consumer行；当前fixture SHA匹配 | strict、skipLibCheck=false、无workspace aliases；显式Node+@types/ms 2.1.0对照，不宣称零附加环境声明闭合 |
| 本轮unit+coverage/lint | 主控已开始10包当前输入验证                                           | 本代理不预填通过、不等待其他大包修复；实际结果后续由主控追加                                            |
| ngc/真实browser        | 未验证                                                               | tsc/Vite JIT不核销inline模板；TestBed重挂不冒充route/browser                                            |

消费实测文件：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation-bare.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-ambient-types.json`。具体编译/root日志同一validation目录 `consumer-rxdb-plugin-search-angular-*.txt`。无补充环境的上游风险由主控去重/裁定，不在本包擅改utils或依赖。

### 3. 五个原 C：已证与必要未验

**C1 SearchHandle映射 — partial。** 原空词、无结果、查询失败、清空、末页场景完整保留。源码锚点48–65/94–98/153–156/199–211；原stock tests、current real-handle序列与新增loadMore rejection probe都有精确锚点。旧实测源稳定，但current real-handle helper已变；需主控当前执行，不能把文件存在/旧测试绿当完整C。

**C2 快速输入与options — partial。** 原A→B、同值新对象、换库/branch、并发翻页保留。source/options按core equality、current query种子和旧订阅隔离已证；新增fake timer/真实异步换源分页在新spec177–259。**source-new标签不是同库branch切换**；真实branch与分页交错、更强A已在途→B等待窗口的中间输出仍须主控证据，当前探针不虚构SQL。

**C3 三端类型与依赖闭合 — partial。** 三端实际root/type/class透传一致，框架容器差异合法；core plugin inject=adapter:local、constructor backend admission和assertInstalled已读。当前tar根import和严格正负consumer在补充环境闭环；bare上游风险保留。缺plugin/不支持backend真实RxDB动态路径、当前同fixture parity和卸载仍需主控；原throwing source仅证明wrapper透传。

**C4 生命周期与注入 — partial。** 原inputs、销毁中异步、子provider、多实例/无泄漏要求保留。历史EnvironmentInjector cleanup已证；新增真实JIT组件setInput、两个parent+一个child实例、在途销毁、四协议流observed归零和data-change disposer精确计数待跑。正常fixture使用@Input setter→Signal，避免Vite无Angular transformer的假元数据问题；不是仅回调DestroyRef桩或把happy-dom当browser。

**C5 类型与真实运行 — partial。** tar `.mts`正负值/类型消费者有条件验证已证；模板正负 `template-valid.ts/template-invalid.ts` 已交给主控ngc，未使用any/ts-expect-error或paths。真实JIT模板DOM输入/空态/执行错误的新探针已写，不等于ngc类型证据。实际demo OnPush/useSearch(computed options)入口已读；现有E2E search单例是a11y/模拟错误，真实route挂卸与真正查询失败不被自动核销。

### 4. 候选与去重

**SA-R2-required-input-read / P2静态候选，未确认。** README48–52在字段初始化中把required input传给useSearch；实现91–92/165–166会立即readSource。疑似构造阶段NG0950，最小期望行为复验在新spec405–412，主控必须按实际错误归因，不能预判或把fixture问题登记为业务bug。只在本目录findings.pending登记，不改README、实现、旧tests或新建RV。

**RV-062只引用**：已有core waiters取消根因与报告，不重复编号。其影响与本包必要未验证分开：缺陷分流不等于完整评审C证据已齐。

### 5. 原七项完成条件与closure

| 条件                                | 结论               | 证据                                                    |
| ----------------------------------- | ------------------ | ------------------------------------------------------- |
| 全范围清点/内容读取/构建来源        | passed             | 原17/17全文、scope SHA吻合；APF/d.ts/source-map来源核对 |
| 每C明确结论/原最低场景保留/补证动作 | passed（登记层）   | 五C全部partial，原场景与具体动作未删除；不等于完整C     |
| 不变量和动态主张分别锚定            | partial            | 源码/历史日志/新未执行probe分开；新门禁待主控           |
| 命令/缓存/skip/四指标当轮记录       | partial            | 历史如实登记；current unit+coverage/lint在跑            |
| 上游/三端/公开消费链                | partial            | root/类型/有条件tar通过；bare/ngc/真实branch/route仍待  |
| 问题根因与去重                      | passed（诚实登记） | RV-062只引用；required input候选未编号、不假确认        |
| 最终评级/评审完成/发布就绪分离      | partial            | 阶段🟡，完整C0/5、最终全对象评级暂缓                    |

详表 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/c-evidence.json` 与 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/closure.json`。主控只需消费现成 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/validation-requests.json`，追加必要实际结果与分流裁定；**原要求不能为赶名额删掉，局部执行不冒充全C**。

### 6. 本包交付附件

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/file-inspection.json`：17原文件完整内容/行区间/关注点与摘要；新增probe单列。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/c-evidence.json`：五原C、生产锚点、测试角色、原最低场景、已证/待验映射。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/validation-observations.json`：历史测量SHA边界、当前tar/bare/补充环境真实证据、工具局限。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/validation-requests.json`：已发现的必要targets、consumer/ngc/browser动作；当前unit/lint由主控执行。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/findings.pending.md`：required-input候选与RV-062去重引用。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/closure.json`：代理交付完成、原完成条件逐条判定、完整C/局部子面/剩余动作与主控最终裁定。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/consumer-valid.mts` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/consumer-invalid.mts`：真实tar独立正负编译已实测，helper不会在无inject context运行。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/template-valid.ts` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/template-invalid.ts`：ngc inline模板输入/事件正负例，待实测。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/review-round2-lifecycle.spec.ts`：13个case冻结，真实core handle与协议流专项明确分面；主控当前运行中。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。

当轮确认意见：[RV-077](../../RV-077-round2-angular-required-search.md)，公开输入边界与独立正确peer环境复验，不等于所有消费情形失败。
