---
kind: review-execution
object: rxdb-plugin-tree-react
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
round2_task: R2-03
round2_source_head: 465f9078e9844af2cbef9936c7321a5576333a01
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-plugin-tree-react：R2-03 实际结果与 closure

**当前分轴（2026-10-05口径审计）：** 原范围全文审阅与逐C意见交付已完成；完整专题证据仍部分闭合，修复/发布未宣称完成。旧 `execution` 不再单独充当总代码评审完成度；见 [四轴进度审计](../../progress-2026-10-05.md)。

**材料完整交付，新增测试已冻结。13/13受控文件、615行全文实读；主控4文件/16例通过、build与零警告lint通过、四覆盖率指标100%。完整原C 2/5（C4、C5）；C1–C3仍partial，全对象不核销、不冒充发布就绪。** 本 worker 没有执行重任务或改实现/原测试/依赖。

## 1. 阅读/基线/生成

13个 scope SHA 全相符：LICENSE/README、manifest/project、三份原spec、index/use-tree、三份tsconfig、Vite。正文/区间/关注点均在 [file-inspection.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/file-inspection.json)，消除了第一轮8文件未读缺口。R2 HEAD `465f9078e9844af2cbef9936c7321a5576333a01`；主控build/unit/lint测量中本包12输入（含new spec）全部当前SHA匹配。不是整仓无并发变化承诺。

原入口门禁（2026-10-03）和第一轮 `44de1138b4d396fc45d6e76ab60476c40fef2223` 的3 files/6 tests及coverage只作历史证据；不替代新增测试。实际 inferred targets为 [nx-project.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/nx-project.json)，typecheck包含build/^typecheck。

生成协议已读：TreeRepositoryGenerator→RepositoryGeneratorBase 的四 `methodOptions`→entity-definition 的 `ENTITY_STATIC_TYPES`；实际MenuSimple.d.ts有 `FindTreeOptions<typeof Entity,EntityTreeRuleGroup>`。本包dist JS/d.ts/maps与source对应，fresh build通过；consumer实体是对齐协议的手写声明fixture，**未假称执行 numeric client generator**；repeat确定性未测。[generated-artifacts.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/generated-artifacts.json)。

## 2. 原最低场景的实际证据

| 原 C           | 结论                     | 已验证与必要边界                                                                                                                                         |
| -------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 输入/树查询 | partial                  | numeric/string ID/options/返回泛型严格consumer和zero转发已证；真实numeric/string查询、深树/plugin/QueryCache链路仍需证据                                 |
| C2 增量/参数   | partial                  | 快改query/空结果/晚到layout/cleanup已证；跨父移动、父删除与full query一致未在真实wrapper仓储链路核销                                                     |
| C3 三端/泄漏   | partial                  | 三端API/类型源码对照、独立typed root消费、React多root已证；同一真实tree fixture三端state/多实例清理仍未证                                                |
| C4 生命周期    | 完整                     | 四hook根级StrictMode真setup-cleanup-setup、快props、卸载晚到与多个root/provider显式实体选择，均被newSpec10/10覆盖                                        |
| C5 类型/render | 完整，保留已归属上游问题 | strict真实tar valid0/invalid十处消费错误、相同值新object/factory、错误props/重渲染/错误透明、零警告lint已证；裸utils声明失败不抹除，不宣称自包含声明全绿 |

### C1 树查询与输入类型 — partial

**原动作**：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。

**原最低场景**：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。

**结论**：四个 wrapper 保留 entity/options 泛型并仅选择精确静态方法和 []/0 默认值；数字 0 不做真值转换。真实层级/QueryCache 禁用在 tree plugin/Repository，不能由 mock 证明。

- numeric/string IDs：numeric/string declaration/zero forwarding verified; real SQL tree queries pending。
- 缺 Tree 插件：registration-phase upstream spec read; wrapper missing-method probe prepared; no new execution。
- QueryCache 禁止：production registration/guard and upstream spec inspected; controller runtime reconciliation pending。
- 深树/level/懒查询：Repository normalized level and lazy result$ inspected; real complete tree chain pending。
- 错误透明/无 flat fallback：actual four-method missing/sync/Observable errors passed, no flat fallback。

**剩余原场景**：原最低真实 numeric/string 查询、深树与 plugin/QueryCache 运行链路补证或精准复用。

### C2 增量结果与参数切换 — partial

**原动作**：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。

**原最低场景**：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。

**结论**：wrapper 没有增量合并状态机；Repository 注册 tree merge；core 的 content identity + layout/request generation + active cleanup 失效旧请求。仅 options 变化保留 stale value 但 hasValue=false，entity identity 变化复位 []，不是旧树被宣称为新查询成功。

- 跨父移动/父删除 vs full query：controller real TreeRepository/adapter fixture required。
- 快速改 query：actual React lifecycle/empty/query cleanup probe passed; not real merge/full-tree assertions。
- 空树：actual React lifecycle/empty/query cleanup probe passed; not real merge/full-tree assertions。
- 销毁/卸载：actual React lifecycle/empty/query cleanup probe passed; not real merge/full-tree assertions。

**剩余原场景**：原最低 real TreeRepository cross-parent move/parent delete vs full tree query；不等无关后端，不新增模式。

### C3 三端 contract 与泄漏 — partial

**原动作**：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。

**原最低场景**：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。

**结论**：三端 root 全部只导出四个同名 hook，method/options/default/result 泛型对称。React/Vue readonly resource 语义字段对齐，Angular 用 Signal 读取；Vue Ref/ComputedRef options 是 native 容器差异，不要求字面类型相同。不能把源码对称或三个独立 mock fixture 当作同一真实树运行。

- 同一 tree fixture 三端状态：not executed; controller must provide/reconcile equivalent fixture。
- 独立 consumer compile：strict real-package consumer/root import verified with ambient types; bare utils gap retained。
- 多实例/泄漏：React multi-root teardown passed; connected three-framework same-tree fixture pending。

**剩余原场景**：原同一真实 tree fixture 的三端公开 state/多实例释放；上游裸声明问题主控归属，不改依赖。

### C4 React 生命周期与竞态 — complete

**原动作**：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。

**原最低场景**：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。

**结论**：core effect/options identity/cleanup 所有权已实读；主控冻结 newSpec 10/10 验证所有四 hook 的根 StrictMode setup-cleanup-setup、快速 props/layout active 窗口、卸载后晚到与多 root/provider 显式实体选择。全部原最低生命周期场景有实际证据，happy-dom 不是 SQL/真实浏览器矩阵。

- 根级 StrictMode：actual frozen lifecycle spec/strict isolated consumer/lint evidence verified as applicable; explicit ambient types qualified; no self-containment or browser SQL claim。
- 快速 props/卸载晚到：actual frozen lifecycle spec/strict isolated consumer/lint evidence verified as applicable; explicit ambient types qualified; no self-containment or browser SQL claim。
- 多个 root/provider：actual frozen lifecycle spec/strict isolated consumer/lint evidence verified as applicable; explicit ambient types qualified; no self-containment or browser SQL claim。

**剩余原场景**：无；全对象质量/上游和发布剩余不冒充原最低场景缺口，见第5节。

### C5 React 类型与 render 边界 — complete-with-upstream-declaration-gap

**原动作**：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。

**原最低场景**：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。

**结论**：原最低 typed consumer/同值新引用/错误 props/重渲染均已取证；严格真实 tarball 正向0、十处错误负向拒绝、root import0，object/factory/errors probes通过且零警告 lint，无 any/TS ignore/Hooks屏蔽。裸环境 @aiao/utils NodeJS/ms 声明失败已明确归上游并保留；补显式类型只证明本包泛型契约，不是发布声明自包含全绿。

- typed real-package consumer：actual frozen lifecycle spec/strict isolated consumer/lint evidence verified as applicable; explicit ambient types qualified; no self-containment or browser SQL claim。
- 相同值新引用/重渲染：actual frozen lifecycle spec/strict isolated consumer/lint evidence verified as applicable; explicit ambient types qualified; no self-containment or browser SQL claim。
- 错误输入/props：actual frozen lifecycle spec/strict isolated consumer/lint evidence verified as applicable; explicit ambient types qualified; no self-containment or browser SQL claim。
- 不吞异常/不屏蔽规则：actual frozen lifecycle spec/strict isolated consumer/lint evidence verified as applicable; explicit ambient types qualified; no self-containment or browser SQL claim。

**剩余原场景**：无；全对象质量/上游和发布剩余不冒充原最低场景缺口，见第5节。

逐C完整生产锚点/原场景映射：[c-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/c-evidence.json)。四wrapper生产锚点 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts:23–81`；core代次/identity/active/cleanup `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts:71–159`；options factory `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/query-options.ts:13–30`；tree task/merge/level 与 QueryCache 在 tree plugin/Repository。

## 3. 当轮主控测量：不混淆范围

- **unit**：2026-10-05 11:07:10 +08:00，Vitest4.1.11/happy-dom；`review-round2-lifecycle.spec.ts`10/10、既有spec6/6；4 files/16 tests、无本包skip。聚合exit1不改变本包通过；无真实SQL/browser断言。
- **coverage**：S/B/F/L=100/100/100/100，各≥80；9/0/4/9分母，branches0/0；scope只有index/use-tree，不拿thin wrapper覆盖率证明上游语义。
- **build/lint**：2026-10-05主控串行无缓存通过，lint显式 `--max-warnings=0`；输入SHA匹配。fresh build不是repeat确定性，普通unit不是test TS编译。
- **newSpec内容**：四hookzero/string转发、[]/0和空态；根 `reactStrictMode:true`订阅2/清理1/active1、最后active0；A→B→C，消费方layout在旧订阅active1时发射晚到；同值object/factory两例；缺方法不fallback、同步/Observable错误、成功后错误、非幂等factory render失败；双root/context carrier显式换实体/单根卸载隔离。
- **provider边界**：tree hook根本不读context；消费方 `useRxDB`选对应实体静态方法。两真实**未连接**RxDB只作context carrier，查询是可控Observable，不冒充真实多库tree。

完整命令/caches/skip/input/当轮coverage/时间：[controller-validation.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/controller-validation.json)；历史对比 [validation-observations.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/validation-observations.json)。原四资源都是native公开状态，元数据复位期间value可以stale但hasValue=false，不能把stale宣称新query成功。

## 4. 独立真实 tar consumer：成功环境与裸失败并存

2026-10-05 **10:58:02 +08:00** 裸strict consumer valid/invalid都有 `@aiao/utils` 的两个上游声明错误：`nextMacroTask.d.ts`缺NodeJS（TS2503），`msTimeToMilliseconds.d.ts`缺ms声明（TS7016）。裸结果/日志保留，owner明确是upstream utils声明暴露的ambient依赖，不在本包修补或新增RV。

2026-10-05 **11:04:13 +08:00** 主控离线实际tar安装后补显式 `types: [node]`、`@types/ms 2.1.0`，strict且skipLibCheck:false：

- valid exit0：numeric0/string0的四options槽、数组实体/id/label、number count、constant/factory，以及四个Equal/Assert均成立。
- invalid exit2：**仅十处消费语义错误**，诊断锚点48/49/50/51/52/54/55/56/57/58与预期完全一致（TS2322/TS2345）；没有把TS2307/上游阻断算作负向通过。
- root runtime import exit0：四个公开hook函数名精确一致；import不是实际hook render或真实仓储全链路。
- 两consumer SHA与主控编译输入匹配；只使用真实包name imports，无workspace aliases/links、any/类型忽略；所有hook在未调用函数体内，不在模块顶层runtime调用。

这证明**显式ambient环境下本包消费泛型契约**，不是“typed consumer无条件全过”或“发布声明自包含”。裸上游失败仍真实存在，主控上游归属/汇总；[consumer-contract.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-contract.json) / [findings.pending.md](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/findings.pending.md) / [controller-validation.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/controller-validation.json)。

冻结fixture：[consumer-valid.mts](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-valid.mts) / [consumer-invalid.mts](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-invalid.mts)；冻结spec：[review-round2-lifecycle.spec.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/review-round2-lifecycle.spec.ts)，SHA `e138ed22e843ac7bfdca1f83628684caf30179512fcf71d121bf2e7dff7ce9ec`。

## 5. 原全对象完成条件/剩余/正式意见

- **F1 met**：全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。 证据：13/13 full content; 615 lines, every concern and interval in file-inspection.json。
- **F2 met-for-reporting-not-C-closure**：每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。 证据：c-evidence.json: C4/C5 full original-minimum evidence; C1-C3 partial; whole object not completed。
- **F3 met-for-reported-evidence**：不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。 证据：production anchors + exact controller commands/environment/current frozen input SHA; dynamic claims scoped to actual own results。
- **F4 partial**：实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。 证据：current build/lint/16 unit + four 100% metrics/cache/skip/input recorded; new spec semantic typecheck and JUnit not observed; repeated determinism not measured。
- **F5 partial**：上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。 证据：public native three-wrapper types/generator protocol/real tarball consumers checked; original same real-tree three-framework fixture pending; bare utils gap upstream-owned。
- **F6 met-with-no-new-findings**：确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。 证据：no new own finding/RV; confirmed bare utils NodeJS/ms gap explicitly upstream-owned, ambient comparison retained。
- **F7 partial**：形成 🟢 / 🟡 / 🔴 的有证据结论，并区分评审完成和修复/发布就绪；本计划勾选完成不代表缺陷已经修复。 证据：scoped review assessment 🟡 evidence incomplete; no whole-object final grade; reviewComplete=false/releaseReady=false。

**🟡 有证据的有界评审意见**：wrapper简洁且生命周期/render最小场景已闭环；上游裸声明缺口已归属，C1–C3真实树链路不足，所以全对象暂不评级、不核销发布。评审取证完成不要求零缺陷；缺必要证据也不能标绿。

`workerDeliveryComplete=true`；完整C4/C5（2/5）；`fullObjectCandidate=false`、`reviewComplete=false`、`releaseReady=false`。未新建本包待确认缺陷/RV，未把RV069/070错归tree或重登已清理RV066/067/068。

剩余固定为原要求：C1–C3真实tree/同fixture三端证据；newSpec类型质量门禁；repeat build/hash；裸utils声明上游归属。请求状态已回填 [validation-requests.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/validation-requests.json)，不再扩模式、不等所有big包。必要未验证分流由主控裁定。机器交付 [closure.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/closure.json)，源阅读与结果完成，本任务释放给后续queued包。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
