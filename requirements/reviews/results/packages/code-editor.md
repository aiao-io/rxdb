---
kind: review-execution
object: code-editor
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
round2_task: R2-01
round2_execution: stage-final-controller-owns-remaining-evidence
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# code-editor：实际评审执行记录

**当前分轴（2026-10-05口径审计）：** 原范围全文审阅与逐C意见交付已完成；完整专题证据仍部分闭合，修复/发布未宣称完成。旧 `execution` 不再单独充当总代码评审完成度；见 [四轴进度审计](../../progress-2026-10-05.md)。

**当前R2-01结论：🟡完整源码/设计评审收口候选，完整原C仅C2；独立tar typed/runtime主探针已过，C5 bundle/缺资源与绑定/browser必要未验待主控。** 下文启动批/第七批/frontends段保留其历史时间与测量边界；以末尾R2-01逐项表及closure.json为最新判定。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

CodeMirror 三端共享的文档同步、语言解析、动态语言装载与可访问性契约。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/code-editor/src/index.ts`](../../../../packages/code-editor/src/index.ts)
- [`packages/code-editor/src/document-sync.ts`](../../../../packages/code-editor/src/document-sync.ts)
- [`packages/code-editor/src/language-resolution.ts`](../../../../packages/code-editor/src/language-resolution.ts)
- [`packages/code-editor/src/languages.ts`](../../../../packages/code-editor/src/languages.ts)
- [`packages/code-editor/src/accessibility.ts`](../../../../packages/code-editor/src/accessibility.ts)
- [`packages/code-editor/package.json`](../../../../packages/code-editor/package.json)
- [`packages/code-editor/project.json`](../../../../packages/code-editor/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 共享文档同步：检查外部 value 与内部编辑的比较、回写、selection/IME 保持，不做相同内容的无谓重建。
- [ ] C2 语言异步竞态：核查语言解析、动态 loader、错误类型与过期加载结果，区分未知语言与加载失败。
- [ ] C3 配置与跨框架语义：列出主题、语言、只读、变更回调和无障碍公共契约，逐一与三个组件对照。
- [ ] C4 可访问性与资源：核查 shared aria/input contract、扩展构造和可用环境边界。
- [ ] C5 打包与依赖：检查 CodeMirror 依赖边界、语言包按需加载和公开类型独立消费。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：编辑器与预览第七批

C1/C2/C3/C4 的共享 helper 已逐源追踪：字符串最小差量、resolved language identity、不可变错误载荷与 a11y/autofocus。新增固定种子 4,096 对文本及 Unicode/换行/NUL 边界复验，核心本轮 **107 passed**。四指标为 statements 99.13%、branches 97.95%、functions/lines 100%，80% 门禁通过。仍不把纯字符串性质当作真实浏览器 selection/IME 已完成；C1 保持部分执行，C5 独立发布消费未完成。语言异常属于封装的 RV-056（已修复），不重复报成 core helper 缺陷。

[本轮实际范围、门禁与剩余项](../../execution-2026-10-04-editor-frameworks.md) · [三端观测](../../evidence/2026-10-04/editor-frameworks/final-observations.json)。七对象严格零警告 lint/typecheck 通过；新红保留，业务实现未改。happy-dom 不是浏览器/辅助技术验收，所有完整 C 项仍需逐项核销。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`code-editor`，日期 **2026-10-05**；🟡 完整范围源码/测试设计评审候选；运行未验面已明确留账。
- scope 是范围，不是阅读证明：21/21 个 tracked 有实际展示行，21 个全文已展示；未读 0 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题            | 本轮结论                                      | 实际生产路径 / 符号行                                                                                                                                                                                                                                   | 事件时序 / 不变量                                                                                                                         | 测试判别力 / 已用证据                                                                                                                                                                                                                                                      | 必要未验与补证动作                                                                                                                                           |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 共享文档同步     | 部分核销：字符串差量已核销                    | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/document-sync.ts:54-69 computeMinimalDocumentChange`                                                                                                                                         | 相同内容返回 null；公共前缀/后缀确定单一 UTF-16 替换段；三端用 External + addToHistory(false) dispatch。                                  | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/__tests__/document-sync.spec.ts:5-62 边界回放`；`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/__tests__/review-document-change-properties.spec.ts:13-43 4096 对固定种子回放；空串/代理项/组合字符` | 字符串回放与合法坐标可独立核销；真实 composing 中外部回写、DOM selection、撤销/滚动仍由绑定/browser 补证，不能算该单测已证明。                               |
| C2 语言异步竞态     | 已核销：解析/loader 与竞态子项                | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/language-resolution.ts:71-109 resolveCodeEditorLanguage / isSameResolvedLanguage`；`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/languages.ts:28-31,58-69,72-232 loader/元数据` | none / not-found / found 分离；description identity 等价才跳过；各绑定请求号递增，A 后到不能盖 B；同步 throw 现已归一化成 rejection。     | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/__tests__/index.spec.ts:192-205,246-294 真实 Rust/15 loader/parser/严格 JSON5 反例`；三端现有慢成功/慢失败/销毁断言与本轮绿色 JUnit 对照。                                                                      | 不复制 RV-056 红报告；未知语言不等于加载故障。按需代码分包体积由 C5 补证，不影响已核销的纯解析/竞态。                                                        |
| C3 配置与跨框架语义 | 已核销：共享契约及三端基础对照                | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/index.ts:11-20 公开 exports / CodeEditorTheme`；`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/language-error.ts:28-70 冻结错误联合/原 cause`                                    | 主题 light/dark；默认 sql/basic/两空格；宿主同步不触发用户 change；三端 error 通道不同但 kind/language/message/cause 相同。               | 共享 language-error/resolution 测试有 not-found、非 Error rejection、none 正对照；三端实际实现逐项对照见下文。                                                                                                                                                             | Angular 独有 CVA / setExtensions / setLanguage 不伪装成共享能力；同绑表单的 FE-PENDING-001 归 Angular，不将其推成共享包失败。                                |
| C4 可访问性与资源   | 部分核销：纯 a11y helper / 不拥有 view 已核销 | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/accessibility.ts:61-85 buildCodeEditorContentAttributes / shouldAutoFocusCodeEditor`                                                                                                         | 属性只给真正 contentDOM textbox；清空名称不产空 aria；disabled/readonly 抑制初始化 autofocus。共享模块没有 EditorView 构造/隐藏全局实例。 | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/__tests__/accessibility.spec.ts:5-53 四属性/清空/焦点正反对照`；Node 环境真实共享单测。                                                                                                                         | helper 行为与不创建 view 可独立核销；Tab 逃逸、屏幕阅读器、大文档性能及真实 IME 未核销，见 browser-required.md。                                             |
| C5 打包与依赖       | 部分核销：打包条目/root 解析已核销            | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/package.json:24-58 sideEffects/exports/files/dependencies`；`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/vite.config.mts:16-20,39-74 dts / external / lazy parser imports`             | 语言声明顶层导出；parser 动态 import；external 清单与 dependencies 对照；pack 排除 spec。                                                 | 主控 packed-consumer-entry-check.json：本包实际 pack、条目无缺失、新 consumer root resolve 成功；不是仅工作区 alias。                                                                                                                                                      | declarationCompilationExecuted=false、runtimeImportExecuted=false；独立 typed consumer、缺语言 chunk、仅 SQL bundle 实测体积仍需补证。未把可解析说成可运行。 |

### 本轮门禁与适用边界

- 主控69项目 strict lint、69项目 typecheck 的 status exitCode 均为0，head为 `44de1138b4d396fc45d6e76ab60476c40fef2223`、cacheDisabled=true、重任务并发1、测量期间输入无变化。仅承接纳入名单和其测量输入；新加 probe 不在旧报告里就不声称其 lint/type 已过。状态文件：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。
- editor 当轮：**107 tests / 0 failed / 0 skipped**；四指标 statements=99.13%、branches=97.95%、functions=100%、lines=100%。JUnit `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage/code-editor/junit.xml`；coverage `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage/code-editor/coverage-summary.json`。不是使用旧 baseline，Vue mock 与 real-CM suite 的证明面分开。
- framework-editor-coverage 总命令 exitCode=1 的唯一失败为 rxdb-angular（249 pass /16 fail，mock 未命中，主控归因）；**不属于本 editor 包**。本包 JUnit 零失败独立承接。
- 实际 pack root：`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor`；packedFileCount=22，missingDeclaredEntries=[]，root 可解析；tarball SHA `cb20a30c7d6c931e91f1d78175305be4c2a3f2a24cd8bc3b2831a855c82fc9cf`。`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json` 明确 declarationCompilationExecuted=false、runtimeImportExecuted=false，不能称 typed/runtime consumer 已通过。
- 本组新增仅两份 bounded review-parallel spec，共6个用例（ngModel/FormControl/value 3，permission grant/导航/销毁3），尚待主控。新候选在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/findings.pending.md`，未确认、不写总 RV。
- 验证请求数组 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/validation-requests.json`；真实 IME/selection 补证协议 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/browser-required.md`。未到的结果不阻止已充分的小 C 独立核销，也不把全应用的未审项掩掉。

### 完成条件逐项证据与候选判定

| 原完成条件                                | 当前状态                           | 具体证据 / 余项                                                                                                                    |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 全部受控文件清点并实际检查                | 候选满足：全文行展示已覆盖范围     | scope 21；有实际行21，全文21；未读/分段逐文件见 inspection，不能用 manifest 替代。                                                 |
| 每个 C 有明确结论与补证动作               | 满足本轮记账；不表示每个C都通过    | 上表逐C有核销/部分/未核销及具体动作；完整动态核销仅按真实报告。                                                                    |
| 不变量/权限由符号锚定，动态主张有当轮环境 | 已读专题有锚；未审专题不冒称证明   | 上表锚定调用者/被调用者与事件顺序；source-only、Node、happy-dom、真实host区分。                                                    |
| 执行/缓存/skip/失败/覆盖测量面登记        | 主控已有结果已承接，待验证仍显式   | 本轮门禁表和主控 status/JUnit；新probe、browser/host结果尚待，不假定通过。                                                         |
| 上下游/适用三框架/多宿主对照              | 已读接口有对照；完整host矩阵未核销 | common editor defaults/change/error/handle；Angular CVA额外面；Chrome静态授权+DevTools shim variance；小程序reLaunch不等进程重启。 |
| 新问题去重/根因/最小修法/边界与复验       | 当前仅2候选待主控；无新confirm     | FE-PENDING-001/002 记录公开触发与最小修法；不复制旧 RV，不将未验证变confirm；本轮不改业务。                                        |
| 有证据的品味结论，评审/修复/发布分开      | 🟡；可提交本对象范围评审收口候选   | 全部文件与C设计结论已落盘；需主控接受明确未验面的收口边界，不能标所有浏览器/consumer专题通过。                                     |

## R2-01：2026-10-05 追加任务实际收尾

### 实际做了什么

- 只负责`code-editor`，全文复读21/21受控文件（6源码、6 spec、7配置、README/LICENSE）；scope指纹全部匹配。每文件区间与关注点在`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/file-inspection.json`，不是用SHA替代正文阅读。
- 只读三端公开index及与helper直接相关的接线/竞态断言，不展开其他对象评审。现有`RV-071`是Angular表单/value优先级，已在registry登记，**不在本任务重复新报**。本包新增问题0、新spec0；107既有测试足够证明helper面，新增的是独立公开tar消费探针。
- 读取真实resolved Nx配置；`typecheck`依赖build，lib/spec配置分别有声明与测试include。根tsconfig已有工作区paths、skipLibCheck=true，**不能拿工作区typecheck代替独立tar strict/skipLibCheck=false验证**。
- 当前忽略dist的JS151行已与6源码/公开exports核对；6张声明map都指向相应`../src/*.ts`，公开d.ts仍保持`readonly LanguageDescription[]`标称回流。未执行重build/可重复性比较，源码读完不意味着dist已刷新。
- 没有执行build/test/coverage/e2e/server/pack/consumer runtime/容器，没有改实现/依赖/原tests、Git索引、总文档或旧RV；无嵌套agent、GUI或发布。

### 当日已有动态证据：承接，不冒充新执行

| 测量面                  | 实际结果                                                                    | 当轮边界                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 本包Node suite          | 107 passed /0 failed /0 skipped；6 suites                                   | JUnit记录accessibility12、diff15、language55、error6、resolution11、properties8                                          |
| V8四指标                | statements99.13%、branches97.95%、functions100%、lines100%，threshold80通过 | summary六源码；没有浏览器/辅助技术覆盖                                                                                   |
| strict lint / typecheck | 第一轮实际exitCode=0，禁缓存、重并发1                                       | 本对象纳入；19个被测源码/配置输入当前匹配，LICENSE/README未在测量指纹内                                                  |
| 三端语言竞态证据        | Angular76、React34、Vue68，报告均0fail/0skip                                | 真实CM + happy-dom的相关suite；不把Vue mock suite说成browser                                                             |
| 实际tar /root resolve   | tar22文件，manifest入口引用missing=[]；第一轮root resolve成功               | tar SHA cb20a30c7d6c931e91f1d78175305be4c2a3f2a24cd8bc3b2831a855c82fc9cf；第一轮typed/runtime仍为false，第二轮通过见下节 |

精确命令、status、JUnit路径和四指标来源已汇总到`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/inherited-evidence.json`。这些测量HEAD为44de1138b4d396fc45d6e76ab60476c40fef2223；R2复读HEAD为465f9078e9844af2cbef9936c7321a5576333a01。对象19个纳入输入及19个相关绑定输入无漂移，**不声称全仓同一稳定HEAD或新增probe已通过门禁**。framework-editor-coverage聚合exitCode=1不污染本包107绿报告；不扩scope修无关对象。

### 原C逐项最终结论

| 原C             | 完整原C？    | 生产锚点与已有判别力                                                                                                                                                                                                                          | 必要剩余动作                                                                                                         |
| --------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C1共享文档同步  | 否，部分     | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/document-sync.ts:54-69`；15边界+8性质/4096对，UTF-16坐标合法、回放精确、等文档null；三端接External/history annotation                                                              | 连续外部更新与用户输入交错、真实selection/IME、只读/undo/scroll由绑定/browser补证                                    |
| C2语言异步竞态  | **是，核销** | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/language-resolution.ts:71-109`；`languages.ts:28-31,58-69,72-232`；error28-70；三端真实facet/compartment断言B先返后A不覆盖，unknown与load-failed分离，旧failure不发事件；JUnit匹配 | 无原C2最低场景缺口；独立tar/物理chunk验证另属C5，不挪用C2通过                                                        |
| C3配置与跨框架  | 否，部分     | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/index.ts:11-20`、`accessibility.ts:25-85`、`language-error.ts:28-70`；三端公共入口、默认值、共享payload和helper接线对照                                                            | 相同宿主options/input序列的文档/事件矩阵待主控；不能忽略Angular RV-071                                               |
| C4可访问性/资源 | 否，部分     | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/src/accessibility.ts:61-85`；12helper用例；共享源码与生成JS不创建EditorView；模块级language cache不是隐藏editor                                                                        | 键盘/原生IME/辅助技术、大文档、重复mount/destroy真实宿主未验；接线归属不等于验收                                     |
| C5打包/依赖     | 否，部分     | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor/package.json:24-58`、`vite.config.mts:16-20,39-74`；真实pack与root resolve；新强类型/runtime探针已准备                                                                                 | 主控valid/invalid/root runtime/smoke已过；仅SQL bundle模块图/体积、缺物理语言资源正负对照仍待补，type-only辅助未执行 |

最低场景与helper/绑定/browser分工完整保留在`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/responsibility-boundary.md`。差量、解析、aria/error是纯helper；动态loader有缓存，竞态与view销毁是绑定责任。**不通过删要求/改不适用来增加完整C数量。**

### 用户追加要求的独立consumer已落盘

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/consumer-valid.mts`：所有9个公开类型、真实helper输入/返回、description/support/loader、resolved三分支穷尽及SUPPORT_LANGUAGES标称兼容。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/consumer-invalid.mts`：9处预期语义类型错误，无paths/any/ts-expect-error；缺模块/工具失败不能算预期拒绝成功。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/runtime-smoke.mjs`：可直接Node运行的assert探针；公开root真实执行、字符串/aria/error/解析与SQL真实parser、重复load缓存。输出明确未验证browser。
- 附加type-only-consumer.mts及独立tsconfig：Node仅导入类型需实测输出无包runtime import。三个strict配置均skipLibCheck=false，valid/invalid分开编译，不继承仓库配置。

主控4项请求已早写`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/validation-requests.json`；离线tar消费、诊断与runtime验收方法见`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/consumer-protocol.md`。**本任务没有执行这些探针；下节typed/runtime通过来自主控实际报告，不能混称本任务执行。**

### 原完成条件逐条

| 原完成条件                                 | R2状态                        | 证据 / 限制                                                        |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ |
| 全部受控源码/配置/tests/构建清点           | 满足                          | 21/21全文；0未读；0受控生成；inspection区间/关注点完整             |
| 每个C明确结论与证据/动作                   | 满足登记要求                  | C2完整；C1/C3/C4/C5部分，每项未验场景及归属不隐藏                  |
| 不变量由生产符号锚定，动态有命令/环境      | 满足现有主张                  | helper/source锚点、继承status/JUnit与输入核对；新probe标未执行     |
| target/cache/skip/失败/复跑/coverage测量面 | 满足现有记录                  | 第一轮禁缓存并发1、107/0/0、四指标和聚合失败边界；本任务重任务0    |
| 适用三框架/宿主链路对照                    | **部分，待主控裁定分流/补证** | 静态接线与C2动态对照已闭环；C1/C3/C4真实browser/设备面不能冒充已验 |
| 确认问题去重/根因/回归                     | 满足本对象无新问题的登记      | 新问题0；RV-071引用现registry归Angular，不复制编号或红报告         |
| 有证据评级且评审/修复/发布分开             | 满足候选记录                  | 🟡源码/设计评审候选；不代表整对象已接受、全部C通过或发布就绪       |

**完成条件6/7满足登记；完整对象候选尚未被主控接受，publishReady=false。** 剩余只有上表原要求，不新增业务/bug范围。机器可读闭环、完整C/局部子面与具体余项在`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/closure.json`；全部本任务改动绝对路径在`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/changed-files.json`。

### 第二轮独立实际tar主探针：主控已执行并通过

收到主控确认并读取`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json`及四份code-editor日志；当前三份探针指纹与主控测量全部相同。对象checkedAt=**2026-10-05T10:57:55.292703+08:00**。

| 第二轮测量          | 实际结果                              | 判别力                                                                                                                    |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| strict valid        | exitCode0，无诊断                     | 实际tar d.ts公开类型输入/返回全部可编译，SUPPORT_LANGUAGES标称类型仍可回流                                                |
| strict invalid      | exitCode2；9个TS2322/TS2345；无TS2307 | 主题/errorKind、语言名/文档坐标、found缺description、disabled、loader extension及函数输入全部按预期拒绝，不是依赖缺失假红 |
| root runtime import | exitCode0；24个runtime exports        | 实际执行独立tar root，非仅resolve                                                                                         |
| runtime-smoke       | exitCode0，passed=true                | 无window/document；helper断言、SQL真实parser无错误节点、重复load缓存；browserBehaviorValidated=false                      |

独立离线真实tar安装环境由主控提供；本对象tar SHA与第一轮相同，版本0.0.26。Node26.7.0、TypeScript6.0.3；actual config是ES2024/NodeNext/strict/skipLibCheck=false，无paths/baseUrl/extends仓库配置。不是运行本任务提出的ES2022完整配置，**actual/proposed已区分**。完整日志、actual config、tar/fixture指纹与依赖版本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/consumer-results.json`。

这批结果关闭C5的公开类型和pack后Node实际消费子面，**不是完整C5/发布就绪**。主控继续补仅SQL bundle模块图/体积与缺语言模块负对照；type-only辅助probe未执行，保留其未验记录。C1/C3/C4真实宿主最低场景仍保留归属和分流裁定，完整原C仍仅C2。源码/C结论先交，不等待整批10任务。

阶段final：源码/设计与独立tar主探针结果已交付；主控ten-packages-current-*串行build/unit+coverage/lint已启动，尚未将其算作通过。SQL实际bundle/missing-lang负例由主控继续，本任务结束、不再扩读或新增用例。

## R2 主控已执行补证：C5 打包与依赖

**C5 原专题已核查，C1/C3/C4 的绑定/browser最低场景未因此通过。** 当前fresh build退出0、scope/依赖输入无漂移；真实published tar消费者 strict/skipLibCheck=false 正例0、反例仅消费输入九项错误，root import和runtime smoke0，Node无DOM环境SQL解析实际成功并缓存。类型only辅助消费者0。

SQL-only esbuild consumer静态依赖闭包2文件、原始277158字节，输出总124个lazy/shared文件、1517375字节，模块图已保存；不把全部lazy产物当首屏或声称已测浏览器网络。独立消费者暂移Python ESM入口，根导入与helper仍可用，请求该语言明确拒绝ERR_MODULE_NOT_FOUND，finally恢复临时文件；没有改工作区资源/业务。

证据：[消费者正负/运行时](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[类型only](../../evidence/2026-10-05/parallel-round2/validation/editor-type-only-consumer.json)、[SQL图与缺资源负例](../../evidence/2026-10-05/parallel-round2/validation/editor-artifact-probes.json)。结果目录相对路径若位于results/packages，以本段对应计划页的同名证据为准。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
