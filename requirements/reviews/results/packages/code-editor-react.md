---
kind: review-execution
object: code-editor-react
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# code-editor-react：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

React：共享 CodeMirror 文档/语言契约的框架组件。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/code-editor-react/src/CodeEditor.tsx`](../../../../packages/code-editor-react/src/CodeEditor.tsx)
- [`packages/code-editor-react/src/index.ts`](../../../../packages/code-editor-react/src/index.ts)
- [`packages/code-editor-react/package.json`](../../../../packages/code-editor-react/package.json)
- [`packages/code-editor-react/project.json`](../../../../packages/code-editor-react/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 EditorView 所有权与同步：核查编辑器只由组件实例创建/释放；共享 document-sync 正确处理外部 value、内部 change 和 selection/IME。
- [ ] C2 动态配置竞态：追踪语言/主题/扩展重新配置与异步语言装载，不能把旧 loader 结果安装到新 props。
- [ ] C3 三端 API / a11y：逐项比较 props/options/change/error、aria 与 keyboard，依共享包规范验证，不凭 demo 视觉一致判断。
- [ ] C4 React 生命周期与竞态：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
- [ ] C5 React 类型与 render 边界：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：编辑器与预览第七批

C1/C2/C3/C4 已追踪真实 EditorView/ref 所有权、StrictMode 视图 identity、callback refs、语言列表比较、effect compartments 和外部同步。确认 RV-056（已修复）：同步异常使 editor 卸载且不进 onLanguageError；rejection 对照维持 view。最终 **33 passed /1 failed**，原 32 条全部保留通过。未把默认语言/全部用户配置称为失败；浏览器 IME/真实输入及发布消费仍待完成。

[本轮实际范围、门禁与剩余项](../../execution-2026-10-04-editor-frameworks.md) · [三端观测](../../evidence/2026-10-04/editor-frameworks/final-observations.json)。七对象严格零警告 lint/typecheck 通过；新红保留，业务实现未改。happy-dom 不是浏览器/辅助技术验收，所有完整 C 项仍需逐项核销。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`code-editor-react`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：2/14 个 tracked 有实际展示行，1 个全文已展示；未读 12 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                    | 本轮结论                                  | 实际生产路径 / 符号行                                                                                                                                               | 事件时序 / 不变量                                                                                                                | 测试判别力 / 已用证据                                                                                                                                                                 | 必要未验与补证动作                                                                                                |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| C1 EditorView 所有权与同步  | 部分核销：事务/所有权                     | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/CodeEditor.tsx:227-235,333-377,514-519 syncDocument / view effect / value effect`                  | 首次创建；用户 docChanged 才 onChange；宿主差量标 External + 不进 history；cleanup 先清 viewRef 再 destroy。                     | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/__tests__/CodeEditor.spec.tsx:117-209 外部追加/中间变化/undo/范围 selection`；本轮 34/34 绿色。                      | 上述部分用例仅作索引，全文未读；真实 DOM selection/IME、输入同时受控回写、大文档滚动未核销。                      |
| C2 动态配置竞态             | 已核销：语言竞态/等价性                   | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/CodeEditor.tsx:308-321,461-512 appliedLanguageRef / stableLanguages / request+view`                | 列表元素等价保留稳定引用；selected description 不变不装载；A→B 后 A 返回被 request+view 丢弃；同步 loader throw 已进入错误通道。 | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/__tests__/CodeEditor.spec.tsx:385-427,622-662 迟到成功/失败、空列表/未知语言、callback identity`；本轮对应用例绿色。 | 逻辑取消不等物理取消；不复制历史 RV-056。本专题不等待其他 app。                                                   |
| C3 三端 API / a11y          | 部分核销：props / DOM a11y / handle       | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/CodeEditor.tsx:55-193,404-421,523-532 props / access / contentAttributes / host`                   | 共同默认值/错误载荷同语义；内部 textbox 属性经 compartment；宿主透传与内部名称分离；disabled 避免 autofocus。                    | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/__tests__/CodeEditor.spec.tsx:480-533 清空属性/disabled/焦点正反/imperative handle`；三端源码互照。                  | readonly 可选择/复制需 browser 验证；原生 FocusEvent 不要求与 Angular void 同类型；真实辅助技术和标签消费未核销。 |
| C4 React 生命周期与竞态     | 部分核销：普通卸载已核销，StrictMode 待证 | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/CodeEditor.tsx:323-331,333-377,465-471 callback refs / cleanup / view identity`                    | 闭包用 ref 获取最新回调；cleanup 清 ref；applied 同时绑定 view，避免 effect replay 误认新 view 已装语言。                        | 卸载 handle 归 null 与慢请求用例绿色；现有测试文件未发现 StrictMode 包装断言，不能用源码注释充当该动态证据。                                                                          | 需真实 StrictMode mount→cleanup→mount + 首次 loader 晚到/新 view 成功的有界对照；本轮不继续新增 probe。           |
| C5 React 类型与 render 边界 | 部分核销：类型与发布 metadata             | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react/src/CodeEditor.tsx:202-206,318-321,379-392 list compare / render state adjustment / imperative handle` | render 中只在语言列表元素真变化时调整 stableLanguages；所有 view 副作用在 effect；ref 公共面明确 null。                          | 主控69 lint/typecheck 绿色；34 个本轮用例绿色；实际 pack 条目、新 consumer root 可解析。                                                                                              | render replay/concurrent 时序及独立 React typed/runtime consumer 未核销；声明文件存在不是 consumer 编译通过。     |

### 本轮门禁与适用边界

- 主控69项目 strict lint、69项目 typecheck 的 status exitCode 均为0，head为 `44de1138b4d396fc45d6e76ab60476c40fef2223`、cacheDisabled=true、重任务并发1、测量期间输入无变化。仅承接纳入名单和其测量输入；新加 probe 不在旧报告里就不声称其 lint/type 已过。状态文件：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。
- editor 当轮：**34 tests / 0 failed / 0 skipped**；四指标 statements=97.45%、branches=94.66%、functions=100%、lines=100%。JUnit `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage/code-editor-react/junit.xml`；coverage `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage/code-editor-react/coverage-summary.json`。不是使用旧 baseline，Vue mock 与 real-CM suite 的证明面分开。
- framework-editor-coverage 总命令 exitCode=1 的唯一失败为 rxdb-angular（249 pass /16 fail，mock 未命中，主控归因）；**不属于本 editor 包**。本包 JUnit 零失败独立承接。
- 实际 pack root：`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-react`；packedFileCount=10，missingDeclaredEntries=[]，root 可解析；tarball SHA `9b9b3d0fdfeff553c8965d3777297b0cc77429b1f2033ac2b902cc157212d585`。`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json` 明确 declarationCompilationExecuted=false、runtimeImportExecuted=false，不能称 typed/runtime consumer 已通过。
- 本组新增仅两份 bounded review-parallel spec，共6个用例（ngModel/FormControl/value 3，permission grant/导航/销毁3），尚待主控。新候选在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/findings.pending.md`，未确认、不写总 RV。
- 验证请求数组 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/validation-requests.json`；真实 IME/selection 补证协议 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/browser-required.md`。未到的结果不阻止已充分的小 C 独立核销，也不把全应用的未审项掩掉。

### 完成条件逐项证据与候选判定

| 原完成条件                                | 当前状态                           | 具体证据 / 余项                                                                                                                    |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 全部受控文件清点并实际检查                | 未满足：仍 partial                 | scope 14；有实际行2，全文1；未读/分段逐文件见 inspection，不能用 manifest 替代。                                                   |
| 每个 C 有明确结论与补证动作               | 满足本轮记账；不表示每个C都通过    | 上表逐C有核销/部分/未核销及具体动作；完整动态核销仅按真实报告。                                                                    |
| 不变量/权限由符号锚定，动态主张有当轮环境 | 已读专题有锚；未审专题不冒称证明   | 上表锚定调用者/被调用者与事件顺序；source-only、Node、happy-dom、真实host区分。                                                    |
| 执行/缓存/skip/失败/覆盖测量面登记        | 主控已有结果已承接，待验证仍显式   | 本轮门禁表和主控 status/JUnit；新probe、browser/host结果尚待，不假定通过。                                                         |
| 上下游/适用三框架/多宿主对照              | 已读接口有对照；完整host矩阵未核销 | common editor defaults/change/error/handle；Angular CVA额外面；Chrome静态授权+DevTools shim variance；小程序reLaunch不等进程重启。 |
| 新问题去重/根因/最小修法/边界与复验       | 当前仅2候选待主控；无新confirm     | FE-PENDING-001/002 记录公开触发与最小修法；不复制旧 RV，不将未验证变confirm；本轮不改业务。                                        |
| 有证据的品味结论，评审/修复/发布分开      | 🟡；只能partial                    | 必须先补未读生产/测试/配置；不因已有门禁/单bug修复宣布对象完成。                                                                   |
