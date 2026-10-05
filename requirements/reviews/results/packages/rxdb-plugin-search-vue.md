---
kind: review-execution
object: rxdb-plugin-search-vue
created: 2026-10-03
updated: 2026-10-05
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
read_head: 465f9078e9844af2cbef9936c7321a5576333a01
execution: partial
---

# rxdb-plugin-search-vue：第二轮实际评审结果

**🟡阶段结论：15/15 原 scope 文件已全文读完，源码与既有局部行为可解释；完整 C 仍 0/5，不是全对象完成候选。** 根 runtime import 已通过；strict tar .mts 正负已在显式 Node/@types/ms 环境闭合，裸上游声明失败保留；组件新 probe/SFC 模板等结果交主控追加。没有修改业务实现/原 tests/依赖，没有自行跑大任务。RV-062 只引用。

用户追加任务 R2-06 / 分配 scope 标签 R2-07；唯一对象是 `rxdb-plugin-search-vue`，不改分配文件。阅读 HEAD `465f9078e9844af2cbef9936c7321a5576333a01`；动态测量各自绑定内容指纹，不冒称一个稳定全仓新 HEAD。

## 1. 全范围阅读与生成/消费入口

| 文件组         | 实际阅读范围                                                                                              | 结论/边界                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 生产           | index.ts 1–16、use-search.ts 1–234                                                                        | scope guard、options 快照、两个 watch、四 Observable、重建/清理/命令所有权及 SSR 全部读取。                                        |
| 全部既有测试   | index 1–35、package-exports 1–12、review-options 1–65、review-parallel-real-handle 1–93、use-search 1–408 | 5 个 spec 全文；区分桩/effectScope/SSR/真实 core；当前 real-handle 与历史运行 fingerprint 不同。                                   |
| 配置/资源/文档 | LICENSE 1–21、README 1–49、package 1–56、project 1–12、tsconfig 1–16、lib 1–35、spec 1–29、vite 1–63      | 全部 scope 文件，不只导航；获得完整 resolved targets；未执行其 build/测试依赖链。                                                  |
| 生成/发布      | 历史真实 tar 10 个文件，生成 source/d.ts/ESM/maps                                                         | 已核源码与产物来源；source/JS 与当前阅读版本一致。ignored local d.ts 与旧 tar 仅 type import 打印不同，不假称重建或确定性通过。    |
| 本轮追加       | review-round2-component-lifecycle.spec.ts 1–252（6 case）、正负 .mts/.vue                                 | 唯一新增获准测试文件；主控已启动新 unit/coverage/lint，尚未给完成结果。consumer .mts 首轮裸失败与最后环境对照见第 3 节及最终追加。 |

证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/file-inspection.json`、同目录 `generated-artifact-inspection.json`。**15 个 scope 文件全部与分配 SHA 相符；只新增一个允许的 probe，不回写 scope。**

## 2. 生产不变量与 Vue setup/watch/dispose

1. **必须在 setup/活动 effectScope。** `use-search.ts:112–121` 使用 getCurrentScope fail-fast；无 scope 不创建 handle。SSR `:215` 不 activate；query 保留 initialQuery，输出初态 idle/[]/undefined/false，commands 无活动 handle 时 no-op。
2. **只有 query 是 consumer 所有。** `:69–93、123–127、217–234`：query 为 Ref<string>；results/state/error/hasMore 由 core Observable 驱动，返回 readonly ref；loadMore 返回 Promise<void>，clear/retry 返回 void。
3. **source/options 不是首次快照。** `:53–61、185–195`：toValue 解包值/ref/computed/getter；getter 明确读取四个判据字段并拷贝 collections，支持深修改，不深遍历整个 source；核心 searchOptionsEqual 比较语义，initialQuery 不参与重建。
4. **重建保留用户 query，先撤旧所有权。** `:156–173`：active=null → unsubscribe 四流 → destroy 旧 handle → source.search(current query, snapshot) → 建四订阅 → 提交 active/subs/source/options。旧 handle 晚到 emission 不能再写 ref，不需要补 per-emission fallback。
5. **watch 生命周期归属 scope。** `:188–212` 同步创建 source/options watch 与 query watch，onScopeDispose 先清 active 再 unsubscribe/destroy；没有额外 onUnmounted 重复销毁。clear 的 suppressedQuery 防 query watcher 回声；新输入恢复正常路由。
6. **debounce/branch/取消属于 core。** Vue 不复制 core debounce/AbortController/pump/branch 行为；loadMore/clear/retry 转发当前 active。scope stop 与 source 重建不保证上游任意 pending waiter 都结算——RV-062 仍只引用既有 root cause。

这些是已读源码结论；effectScope/SSR/桩旧 suite 的已测局部与新组件/在途时序的待测部分下文分列，不用静态顺序替代动态证据。

## 3. 已读取动态结果、缓存与测量面

### 第一轮有效历史测量

| 测量            | 本包实际结果                                                           | 证据与边界                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/V8         | 2026-10-05 09:06:02，4 files / 28 tests passed，无 skip                | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt:8989–9057`；2 次 readonly 负例 Vue warn 留原日志，不等于 ESLint 警告。本包目录无独立 JUnit，不凭其它包补造。 |
| 四指标          | statements 98.57 / branches 96.42 / functions 100 / lines 100，均 ≥80% | 同批 `framework-editor-coverage/rxdb-plugin-search-vue/coverage-summary.json` 与 `coverage-gate.json`；源/配置/core 已测生产输入无漂移，未覆盖当前 real-handle 或本轮新 probe。                                                           |
| ESLint          | max-warnings=0，旧批通过                                               | `parallel/validation/all-object-strict-lint.txt:310–314` 与 status/input sha；新增文件不继承旧绿。                                                                                                                                        |
| 类型            | workspace vue-tsc --build --emitDeclarationOnly，旧批通过              | `parallel/validation/all-object-typecheck.txt:1029–1033`；workspace paths/skipLibCheck 与 include 不等于外部 strict .vue 模板消费者。                                                                                                     |
| 真实 core probe | 09:34:17 Vue 1 test passed；Angular/React 同名序列分别有绿日志         | `parallel/validation/new-parallel-probes.txt:622–664`；Vue measured f30c85…→当前 1be30d…，不说当前 93 行已跑。整批 exit=1 是其他对象失败，不说本包红。                                                                                    |
| 实际 tar 静态   | 旧 tar 10 文件齐，根 ESM resolve 成功                                  | `parallel/validation/packed-consumer-entry-check.json`；旧 tar SHA 271b2973…，当时没执行声明编译/runtime import，不能扩大。                                                                                                               |

历史四批均禁 local/remote cache、串行，状态/命令/测量输入/本包与 core 漂移已存 `validation-observations.json`。没有将 72 对象不同批次的绿称作一个稳定最新 HEAD。

### 第二轮：主控真实 tar consumer 首轮实际结果

主控记录：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json`，本包 checkedAt **2026-10-05T10:58:19.512368+08:00**。

- 实际 tar 安装在 workspace 外，包名 imports，无 workspace alias/link；strict=true、skipLibCheck=false。本轮 tar SHA `0c5f8ccfad70797492baea3b235a005a9b2339cf52be583a08a6d00c397d3227`，与历史 tar 分开。
- **root runtime import exit=0**，真实导出 `SearchExecutionError`、`useSearch`。证据 `consumer-rxdb-plugin-search-vue-root-import.txt`。仅证明入口被执行，没有启动 source/handle/组件。
- **consumer-valid.mts：tsc exit=2。** 没有本 fixture 的诊断；实际失败在 `@aiao/utils/dist/async/nextMacroTask.d.ts:14`（TS2503 缺 NodeJS）和 `@aiao/utils/dist/date/msTimeToMilliseconds.d.ts:1`（TS7016 缺 ms 声明）。不是正例通过，也不能仅凭外部错误确认为 Vue 实现问题。具体路径/原诊断留在 `consumer-rxdb-plugin-search-vue-valid.txt`。
- **consumer-invalid.mts：tsc exit=2。** fixture 命中 14 条预期错误：非法 source/错误 handle/computed source、非数字 options/非 string collections、query 非 string、4 个 readonly value 写入、非法 state、Promise<void> 非 number；同时混有上述 2 条依赖错误，因此不能报 clean negative pass。原诊断留在 `consumer-rxdb-plugin-search-vue-invalid.txt`。
- 主控的 fixture SHA 与本目录正负 .mts 当前字节相符。两份 .vue 尚无日志；此次 tsc .mts 验证不冒称 vue-tsc 模板编译已过。上游声明闭合由主控归因/补证，**不加 stub、any、ts-expect-error 或 skipLibCheck 改绿**。

## 4. 原 C 逐项结论与剩余动作

### C1 SearchHandle 映射 — partial

原动作：逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。
原最低场景：空词、无结果、查询失败、清空、末页；框架状态不能吞掉核心错误。

生产锚点：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:69–93、123–127、156–173、217–234`。

已证：四流、query/commands、旧 suite 的局部映射，历史真实 handle 序列有绿。必要缺口：当前 93 行 `review-parallel-real-handle.spec.ts:47–93` 需主控重跑并绑定 error identity/empty/retry/两页/末页/clear 的完整序列；新取消迟到错误探针没有执行。不能拿变更前 1 test 绿核销。

### C2 快速输入与 options identity — partial

原动作：核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。
原最低场景：A→B 快速输入、相同值新对象、换库/branch、并发翻页；不重复创建 handle 或串结果。

生产锚点：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:53–61、156–173、185–204`。

已证：字段快照、collections 拷贝、语义相等对象不重建、initialQuery 仅播种、当前 query 保留、旧桩流解绑/命令最新路由；历史 deep options 通过。新增 `review-round2-component-lifecycle.spec.ts:121–190` 使用真实 core handle + 人工控制 Promise，覆盖在途 page1/source/computed/deep options 替换与迟到结果、A→B 最终结果、clear 取消。

必要缺口：新 probe 未跑；source identity/collections 替换不等于同一个真实 RxDB branch；当前同 fixture 三端异步/branch/并发分页仍需主控具体证据。A→B probe 只断言最终 B，不保证每一中间帧立即跟最新 query，不夸大 cancellation/ownership。

### C3 三端类型与依赖闭合 — partial

原动作：对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。
原最低场景：缺 plugin、typed consumer、同 fixtures parity、卸载；必须依赖能通过 inject 闭合。

生产锚点：本包 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/index.ts:13–16`、`src/use-search.ts:112–121、156–173`；core `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search/src/plugin.ts:196、239–246、299–310、632–654、752–775`。

已证：三端实际根导出/class/type 一致，原生状态容器有意不同；Vue 不捕获 source.search 的安装错误；adapter:local/后端可用性/ready 属 core 的安装前置。第二轮真实 root import 已过。

必要缺口：新无 I/O RxDB 缺插件/插件未连接/unsupported backend 与组件卸载探针未跑；strict .mts 对照已在显式 Node/@types/ms 环境通过、裸失败保留；current same-fixture parity 与 SFC 模板未闭合。没有自行连接任何 backend，不用 constructor 拒绝场景假称正向 connect/inject 全链路已测。

### C4 Vue 生命周期与响应式来源 — partial

原动作：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
原最低场景：替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。

生产锚点：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:53–61、112–121、156–215`。

已证：同步 activate/watch/onScopeDispose、清 active→unsubscribe→destroy、old stream 隔离、SSR 不建立订阅；历史真实 effectScope stop/ref/getter/deep options 与 renderToString 通过。

新增 `review-round2-component-lifecycle.spec.ts:76–153、192–221` 是真实 Vue defineComponent/setup/mount，happy-dom：两个独立实例、一方卸载取消在途/迟到错误不回写/命令与 watcher no-op、另一方继续成功；四个原流 observed 从 true→false。它不是单纯 effectScope，也不是原生浏览器/真实 SFC 挂页。必要缺口：主控执行该 probe；SFC 模板消费单独验证，不把 .mts 根 import 冒充组件卸载。

### C5 Vue 类型与 SFC 消费 — partial

原动作：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。
原最低场景：vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。

生产锚点：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:69–93、112–115、217–234` 与 `src/index.ts:13–16`；声明来源为 vite.config 与 tsconfig.lib。

已证：精确固定 SearchResult/Ref/readonly/Promise 类型，声明 signature 来源已核；strict 负例实际诊断验证部分约束，但不是 clean 编译闭合。positive .mts 含真实 createSearchHandle 的 SearchSourceLike、值/ref/readonly/computed/getter/undefined options；.vue 含 setup/v-model、props、typed emits、outputs；negative .vue 错误字段/emit 参数明确，不用抑制标签。

必要缺口：strict .mts 对照已通过（显式 Node/@types/ms，裸环境失败保留）；正负 .vue 用 vue-tsc（不是 tsc）证明模板/props/emits；新 identity probe `review-round2-component-lifecycle.spec.ts:164–171` 与当前 real-core error identity 未跑。SearchResult.entity 是字符串，不把它误称 RxDB 实体对象 identity。

## 5. 6 个新增 probe 的测量边界

文件：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/__tests__/review-round2-component-lifecycle.spec.ts`。**定义完成，尚未由本代理执行；不是 6 tests passed。**

1. 真实 core handle 两个 Vue mount 实例，卸载一方取消在途与隔离迟到失败，存活方正常完成，卸载后的 query/commands 不重启 I/O。
2. computed source 与深 options 同 tick 替换时释放已运行分页，旧结果迟到不污染新 handle，当前 query 保留。
3. A→B core 串行队列最终只保留 B，frozen output 数组/元素 identity；clear 取消当前请求并隔离迟到失败。
4. 四 Observable 桩不自行 complete，专门验证 bridge unsubscribe 与停止 watcher；卸载后的晚到流值和命令 no-op。
5. 真实未连接 RxDB 缺搜索插件 TypeError、存在但未安装 plugin 显式 not installed；不连接后端。
6. 实际 plugin 在不支持的 http backend 上 constructor 抛 SearchUnsupportedAdapterError；不注册 adapter/启动服务。

RV-062 的成功订阅重入 pending loadMore 场景**不重复新增**；第 2 个测试只检验已经执行中的 page waiter 迟到结算，不能据此证明 RV-062 已修复。

## 6. 问题去重、阶段品质与完成条件

**无新增确认业务缺陷。** RV-062 P2/core root cause 保持引用；strict consumer 首轮上游 NodeJS/ms 声明诊断留在 findings.pending，交主控归因去重，不写新 RV，不修改 utils。README 旧 Angular 名称仅记录静态对照。

| 原全对象完成条件                | 判定                             | 具体依据                                                                                                   |
| ------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 全受控清点/内容阅读/构建入口    | 通过                             | 15/15 full-content 与 generated-artifact-inspection；新 probe 单列，scope 未改。                           |
| 每 C 明确结论/原因/补证         | 通过（结论登记），场景核销未完成 | 5 个 partial 原动作/最低场景/生产锚点/请求全部保留；完整 C 0/5。                                           |
| 源码不变量与动态最小证据分离    | 已登记范围通过                   | 历史命令/fingerprints/错误与新未运行 probe 各自标明。                                                      |
| 当前目标/cache/skip/重跑/四指标 | partial                          | 历史与首轮 consumer 已完整登记；新小包 unit/quality/JUnit 未到，不能继承旧覆盖率。                         |
| 上下游/三端/消费链路/行为风险   | partial                          | 静态对照/root runtime import 通过；typed .mts 显式环境通过；SFC/branch/parity 必要缺口明确。没有行为修改。 |
| 问题去重/未验证不包装           | 通过                             | RV-062 reference-only，无新确认 RV；声明消费失败不洗绿。                                                   |
| 评级/评审完成/发布就绪分开      | 未全核销                         | 阶段 🟡；reviewComplete=false、fullObjectCandidate=false、releaseReady=false。缺验证不因上游已分流而消失。 |

## 7. 交付与主控剩余动作

- 对象计划：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/packages/rxdb-plugin-search-vue.md`。
- 机器证据目录：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue`。
- `file-inspection.json`：15 文件全文区间与关注点；`c-evidence.json`：原 C 结论/锚点/最低场景与必要未验；`closure.json`：原完成条件、完整 C/局部子面/完成候选与剩余动作。
- `validation-observations.json` / `validation-requests.json`：历史/主控消费者真实结果与本包后续精确测量；`generated-artifact-inspection.json`：来源/实际旧 tar/当前 ignored dist 差异；`findings.pending.md`：仅必要归因与 RV-062 引用。
- `consumer-valid.mts` / `consumer-invalid.mts`、`consumer-valid.vue` / `consumer-invalid.vue`、`consumer-contract.json`：用户要求的真实 root source/return/ref API 及原 SFC 正负场景。

主控只需按请求补本包当前 unit/lint/types/四指标、strict tar 正负 consumer 的上游声明闭合、SFC 模板和具体 branch/parity 证据；必要未验证的分流由主控最终裁定。**不等全部无关后端、不运行 affected/serve/容器、不提交/撤销其他人的变更。**

### 历史记录留存

2026-10-03 `3b3e449e10c6a587056a2ae947eddfd161834f97` full-run 阶段，本包 lint/typecheck/build 通过、test 失败。原始日志仍在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-03/full-run/`，不是本轮失败/通过。

2026-10-05 第一轮 frameworks 仅 4 文件正文片段/10 未读、原 C 0/5；本轮将原 scope 全文阅读补到 15/15，但没有因此自动补全动态验证。第一轮详细记录仍在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/`，不改总记录或旧证据。

## 最终交接追加（2026-10-05T11:09:34.173740+08:00，以主控最新直接报告为准）

- **独立实际 tar strict valid exit=0；invalid 仅消费类型拒绝；root runtime import exit=0。** 主控补了显式 Node typings 与 @types/ms。本目录两个 .mts fixture 未改动，未引入 paths/any/ts-expect-error。
- 裸环境的上游 NodeJS/ms 声明失败仍保留在原日志与 validation-observations；不把显式类型环境成功倒写成裸环境成功，也不新增/重复登记 RV。
- 主控已启动 current newSpec unit+coverage/lint，结果尚未交付；SFC 正负模板、原真实 branch/parity 等未测面由主控按请求追加。root import 与 .mts 不能充当 SFC/组件运行证据。
- **本代理审读/文件交付完毕；不再扩读、不增加探针、不等待 4 个 queued 或其它大包。** 完整 C 0/5、全对象候选 false 是当前缺测事实，主控拿到剩余日志后直接补证/裁定 closure。没有 git add/commit/reset/stash/unstage 操作；他人已 staged 的共享改动保持原样。
- 全部改动绝对路径在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/changed-files.json`。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
