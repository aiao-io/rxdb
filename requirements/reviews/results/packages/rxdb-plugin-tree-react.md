---
kind: review-execution
object: rxdb-plugin-tree-react
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
round2_task: R2-03
round2_source_head: 465f9078e9844af2cbef9936c7321a5576333a01
---

# rxdb-plugin-tree-react：R2-03 实际评审与交付记录

**材料收尾完成：13/13 受控正文实读，615 行；原 C1–C5 均有源码/场景/缺口映射。原完整 C 核销 0/5，结果仍为 partial，不是全对象完成候选。** 新增一个生命周期 spec（10 例）和两个独立 consumer 输入；运行验证由主控执行。本 worker 未跑重任务、未改实现/原测试/依赖。

## 1. 基线和文件阅读

- 2026-10-03 初始入口/门禁基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；当时 lint/typecheck/test/build 记录仍是历史入口证据，不给当前全 C 背书。
- 2026-10-05 第一轮 framework 真实测量 HEAD `44de1138b4d396fc45d6e76ab60476c40fef2223`；R2 实读 HEAD `465f9078e9844af2cbef9936c7321a5576333a01`。
- 本次 13 个 scope 文件哈希全部相符：LICENSE、README、manifest、project、三份原 spec、index/use-tree、三份 tsconfig、Vite。每份全文和关注点已登记；消除了第一轮“5 段正文、8 未读”的阅读缺口。
- dependency/core/三端只作只读边界与生成协议对照，不扩大评审对象；新增 spec 正文和两个 consumer 也已全读。

[file-inspection.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/file-inspection.json) 记录区间，不以哈希清单替代正文；[nx-project.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/nx-project.json) 保存真实 inferred build/test/lint/typecheck 及 dependsOn。

## 2. 核心判断：静态仓储/状态所有权

四个 wrapper 只有同名 method、默认值和泛型，不读取 provider、不创建第二套订阅、不转换 numeric/string ID、不 fallback 到 `find`。生产锚点：

- [/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts:23–81](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/use-tree.ts)：四个输入槽、结果类型与默认值。
- [/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts:71–159](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/hooks.ts)：内容 optionsKey、render 同步元数据复位、layout/requestId/active 保护、effect 查询及 cleanup。
- [/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/query-options.ts:13–30](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-react/src/query-options.ts)：常量/factory 和非幂等显式 render TypeError。
- [/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts:48–119,130–132](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts)：树 merge/task/lazy runner 与 entityId 的 `?? null`/level 校验。
- [/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/plugin.ts:44–64](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/plugin.ts)：树仓储 QueryCache 禁用由插件声明，不在 wrapper 内静默退化。

仅参数变化采用 stale-while-revalidate：value 保留，但 hasValue=false/isLoading=true。实体身份变化复位数组，防止返回类型和旧实例不一致。provider 测试由消费方 `useRxDB` **显式选择对应实体**；不把“同一静态实体必然自动换库”当本包契约。

## 3. 历史动态证据与本轮未执行边界

| 测量           | 可确认事实                                                                                        | 不允许推出的结论                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| unit           | 2026-10-05 09:06:15，Vitest 4.1.11/happy-dom；3 files / 6 tests passed；本包片段无 skip，缓存禁用 | 泛型函数体 expect 不是类型编译；没有新生命周期 spec 或真实 tree SQL        |
| coverage       | S/B/F/L = 100/100/100/100，阈值各 ≥80；分母 9/0/4/9，branches 是 0/0                              | 不是 core hook、TreeRepository、独立 consumer 或完整 UI 覆盖率             |
| lint/typecheck | 第一轮无缓存且 lint 用 `--max-warnings=0`；本包原 11 输入及 8 已选依赖源 SHA 相符                 | 未比对完整依赖树、根 tsconfig/lockfile；新 spec/new consumers 没有继承旧绿 |
| pack/resolve   | 源发布根、10 个 tarball 文件、declared entries 缺失 0；独立 ESM root resolve 通过                 | 不等于声明 compile 或 runtime module import；不声称 build 确定性           |
| 当前 R2        | Nx metadata、三个新增文件 syntax parser 无语法诊断；限定文件 Prettier 格式化                      | **没有 typecheck/test/build/coverage 执行**，不能写动态通过/失败           |

精确命令、来源、输入 SHA、聚合 exit code 的对象边界：[validation-observations.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/validation-observations.json)。框架队列聚合失败不替代本对象片段结果，也不借其他包成功扩展本包语义。

## 4. 原 C：结论、原场景与证据

### C1 树查询与输入类型 — partial

**原动作**：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。

**原最低场景**：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。

**静态已证**：四个 wrapper 保留 entity/options 泛型并仅选择精确静态方法和 []/0 默认值；数字 0 不做真值转换。真实层级/QueryCache 禁用在 tree plugin/Repository，不能由 mock 证明。

**原场景状态**：

- numeric/string IDs：type fixtures + zero forwarding probe prepared; real query pending。
- 缺 Tree 插件：registration-phase upstream spec read; wrapper missing-method probe prepared; no new execution。
- QueryCache 禁止：production registration/guard and upstream spec inspected; controller runtime reconciliation pending。
- 深树/level/懒查询：Repository normalized level and lazy result$ inspected; real complete tree chain pending。
- 错误透明/无 flat fallback：source checked and historical delegation; new error probe not run。

**已交付证据/探针**：

- historical 6-test dispatch/default/string fixture unit result; source matched。
- generated-artifacts.json provenance and public declarations read。
- review-round2-lifecycle.spec.ts:115-154/244-279 prepared numeric/string forwarding and missing-method/error probes。
- consumer-valid/invalid.mts prepared numeric/string ID/options/return generics。

**必要收尾**：controller test/typecheck/consumer；real numeric/string/deep tree and plugin/QueryCache guard evidence paired to actual inputs。

### C2 增量结果与参数切换 — partial

**原动作**：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。

**原最低场景**：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。

**静态已证**：wrapper 没有增量合并状态机；Repository 注册 tree merge；core 的 content identity + layout/request generation + active cleanup 失效旧请求。仅 options 变化保留 stale value 但 hasValue=false，entity identity 变化复位 []，不是旧树被宣称为新查询成功。

**原场景状态**：

- 跨父移动/父删除 vs full query：controller real TreeRepository/adapter fixture required。
- 快速改 query：prepared active-old-subscription layout race and A-B-C test, not run。
- 空树：prepared []/0 and flags checks, not run。
- 销毁/卸载：prepared explicit unsubscribe/late error/count probes, not run。

**已交付证据/探针**：

- historical result pass-through/default state。
- review-round2-lifecycle.spec.ts:115-228 prepared empty tree/pending/query A-B-C/active layout late value/unmount。

**必要收尾**：controller unit；real cross-parent move/parent deletion comparisons to full tree query; no unrelated backend matrix required。

### C3 三端 contract 与泄漏 — partial

**原动作**：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。

**原最低场景**：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。

**静态已证**：三端 root 全部只导出四个同名 hook，method/options/default/result 泛型对称。React/Vue readonly resource 语义字段对齐，Angular 用 Signal 读取；Vue Ref/ComputedRef options 是 native 容器差异，不要求字面类型相同。不能把源码对称或三个独立 mock fixture 当作同一真实树运行。

**原场景状态**：

- 同一 tree fixture 三端状态：not executed; controller must provide/reconcile equivalent fixture。
- 独立 consumer compile：actual package-name inputs ready; controller offline real installation typecheck pending。
- 多实例/泄漏：prepared separate React roots/context carriers, not real connected multi-db tree and not run。

**已交付证据/探针**：

- three counterpart string generic fixtures fully inspected for relevant ranges。
- historical actual pack + ESM root resolution (not import/typecheck)。
- new consumer positive/negative files and provider/multi-root test prepared。

**必要收尾**：controller offline consumer positive+negative diagnostics；same real fixture state/teardown evidence across three native wrappers。

### C4 React 生命周期与竞态 — partial

**原动作**：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。

**原最低场景**：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。

**静态已证**：四 wrapper 委托同一 core hook；根 StrictMode 真 setup-cleanup-setup 的计数、layout 清理窗口和多 root/entity-provider 显式选择已写最小探针。tree hook 自身不读 useRxDB，不增加自动 provider 重定向或 fallback。

**原场景状态**：

- 根级 StrictMode：prepared exact subscriptions=2/cleaned=1/active=1 then unmount active=0; not run。
- 快速 props/卸载晚到：prepared active layout emission and A-B-C teardown; not run。
- 多个 root/provider：prepared explicit entity selection and one-root teardown isolation; not run。

**已交付证据/探针**：

- review-round2-lifecycle.spec.ts:156-228/303-353 prepared。
- RTL local pure.js root strictModeIfNeeded source read (per-call reactStrictMode:true, not wrapper:StrictMode)。
- provider uses genuine unconnected RxDB instances as context carriers; Observable queries stay controlled mocks。

**必要收尾**：controller test + zero-warning lint + typecheck at current new spec SHA。

### C5 React 类型与 render 边界 — partial

**原动作**：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。

**原最低场景**：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。

**静态已证**：public declaration retains inputs/InstanceType<T> output; missing method/query error is resource.error, non-idempotent/non-serializable options cause explicit render TypeError. identity comparison by content avoids same-value new object/factory resubscriptions; these lifecycle claims require new execution. No new any/TS ignore/Hooks rule suppression.

**原场景状态**：

- typed real-package consumer：prepared positive/negative, controller compile pending。
- 相同值新引用/重渲染：prepared two mode test (object/factory); not run。
- 错误输入/props：prepared numeric/string/level/resource negatives and render factory throw; not run。
- 不吞异常/不屏蔽规则：new source static inspected; zero-warning lint still controller request。

**已交付证据/探针**：

- historical workspace typecheck/string negative fixtures and strict lint only。
- consumer-valid.mts 4 exact ID/result type assertions and 8 positive hook calls in uninvoked functions。
- consumer-invalid.mts ten expected semantic errors with no type ignores。
- review-round2-lifecycle.spec.ts:230-301 object/factory rerender + error + invalid options prepared。

**必要收尾**：controller positive exit0 + invalid expected diagnostic anchors, not TS2307 alone；controller unit/lint/typecheck/build public declarations。

## 5. 最小新 spec 与独立 consumer

[/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/**tests**/review-round2-lifecycle.spec.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/review-round2-lifecycle.spec.ts)：

1. 四 hook 区分 numeric `0` / string `'0'`，默认/[]/0 空态和重订阅计数；数字 0 的 isEmpty=false 是标量资源语义，不改成数组空态。
2. 根级 `reactStrictMode:true`，真 subscription 2/cleanup 1/active 1，最终卸载 active 0；不是只双 render 的嵌套 wrapper。
3. query A→B→C；consumer layout effect 在旧订阅仍 active=1 时发射晚到值，验证代次窗口；随后旧值/错误/卸载清理。
4. 同值新 object 与同值新 factory 两例（计入 10 例），变化 level 才重订阅。
5. 四缺方法 error 与 flat `find` 未调用；同步 throw/Observable error；成功后失败保留旧 value 但清空成功标记；非幂等 factory 在 render 显式失败。
6. 两个真实但**未连接** RxDB 作 provider context carrier，消费方选择不同静态实体，多 root 单根卸载不取消另一根。查询仍是受控 Observable，不冒充真实多库 tree 测量。

[consumer-valid.mts](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-valid.mts) / [consumer-invalid.mts](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-invalid.mts)：

- 只进口 `@aiao/rxdb`、`@aiao/rxdb-plugin-tree`、`@aiao/rxdb-plugin-tree-react`、`@aiao/rxdb-react`；无 workspace paths、`any` 或类型忽略。
- valid：数字/string ID 的精确类型、四 options 槽、`InstanceType<T>[]` 数组实体/id/label 和 number counts、constant/factory；四个 Equal/Assert 防泛型擦除。
- invalid：十个错误表达式（交叉 ID、错误 level、错误 options、交叉数组实体、number count 赋 string resource）保留真实类型错误，无 `@ts-expect-error`。
- 所有 hook 调用都位于未调用的自定义 hook 函数体内；仅 typecheck，不在模块顶层 runtime 执行。主控必须核对错误来自登记表达式，不能把未安装 package/TS2307 当负向成功。
- 实体声明是对齐生成槽的**手写 consumer fixture**；本任务没有执行 generator。已读生产 TreeRepositoryGenerator、RepositoryGeneratorBase、entity-definition 与实际 MenuSimple.d.ts 作来源/结果对照；numeric generator 端到端仍不冒充已测。

详细正反锚点：[consumer-contract.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-contract.json)；生成/现存产物来源：[generated-artifacts.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/generated-artifacts.json)。主控消费者的真实安装、编译和根 import 单独留证。

## 6. 原全对象完成条件与正式结论

- **F1 met**：全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。 证据：13/13 full content; 615 lines, every concern and interval in file-inspection.json。
- **F2 met-for-reporting-not-C-closure**：每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。 证据：c-evidence.json preserves original actions/minimum scenes and remaining actions; 0/5 complete。
- **F3 partial**：不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。 证据：production anchors and old exact run surface recorded; new probes only syntax parsing, no new dynamic assertions claimed。
- **F4 partial**：实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。 证据：historical command/cache/input/100% four metrics recorded, branches 0/0; current new test/lint/typecheck/build results absent。
- **F5 partial**：上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。 证据：public 3-wrapper/types and generator static-slot protocol checked; same real tree three-framework fixture and independent consumer compilation pending。
- **F6 met-with-no-new-findings**：确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。 证据：findings.pending.md; existing registry inspected, unrelated RV069/070 not charged to tree wrapper; no new RV allocated。
- **F7 partial**：形成 🟢 / 🟡 / 🔴 的有证据结论，并区分评审完成和修复/发布就绪；本计划勾选完成不代表缺陷已经修复。 证据：scoped review assessment 🟡 evidence incomplete; no whole-object final grade; reviewComplete=false/releaseReady=false。

**🟡 有界评审意见：wrapper 结构简洁、源码边界可解释；目前缺动态闭环证据，不给全对象最终评级。** 没有新增已确认/待确认缺陷；RV-069/070 不属本包，RV-066/067/068 不重登。见 [findings.pending.md](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/findings.pending.md)。

`workerDeliveryComplete=true`；`completeCCount=0/5`；`fullObjectCandidate=false`、`reviewComplete=false`、`releaseReady=false`。评审完成不要求零缺陷，但不能缺原必要场景证据。

**剩余不是新的无限 scope，而是原要求**：当前 spec/lint/typecheck/coverage、离线正反 consumer/根 import、稳定 build 确定性、C1/C2/C3 真实 tree/同 fixture 三端对照。6 请求已在 [validation-requests.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/validation-requests.json)，C4 可在现有探针真实执行且证据成立后独立核销；C5 还须独立 consumer 等证据。

最终汇总：[closure.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/closure.json)；每 C 原动作/最低场景/生产锚点/补证动作：[c-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/c-evidence.json)。未经主控实际测量或明确的必要未验证分流裁定，本任务不自行降级要求或标不适用。
