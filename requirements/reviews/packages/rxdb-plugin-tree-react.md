---
kind: review-plan
object: rxdb-plugin-tree-react
source_root: packages/rxdb-plugin-tree-react
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
round2_task: R2-03
round2_source_head: 465f9078e9844af2cbef9936c7321a5576333a01
---

# rxdb-plugin-tree-react：有界评审计划与 R2-03 收尾

**2026-10-05 已实读全部 13 个受控文件、615 行，补证材料已交付；完整 C 仍为 0/5。** 计划不扩大对象、不修改实现、不删除原最低场景。主控执行新 spec / 真实 tarball consumer；未取得运行证据前，`execution` 保持 `in-progress`。

## 1. 唯一范围与基线

- 对象：React TreeRepository 响应式查询 wrapper；Nx 项目 `rxdb-plugin-tree-react`；npm 名称 `@aiao/rxdb-plugin-tree-react`。
- 工作区：`/Users/jimmy/Documents/aiao/rxdb`。
- 原计划：`main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03；第一轮动态测量：`44de1138b4d396fc45d6e76ab60476c40fef2223`，2026-10-05。
- R2 实读 HEAD：`465f9078e9844af2cbef9936c7321a5576333a01`；13 个原 scope SHA 全部相符。原 README/配置/license/三份原 spec 均未排除，全部逐文件正文阅读，不是 sha 清单替代。
- 唯一写入：本计划、本对象结果、本对象 R2 证据目录；例外仅新增本包 `src/**/review-round2-*.spec.ts`。当前新增一份 spec，原源码/原测试/依赖只读。禁止发布、GUI、嵌套代理与 Git 状态操作。

完整文件/区间/关注点：[file-inspection.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/file-inspection.json)。实际 inferred targets：[nx-project.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/nx-project.json)。本包 `project.json` 只是局部覆盖，不能代替 resolved config。

## 2. 数据结构、所有权与公开边界

| 边界          | 当前来源 / 结论                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 四个公开值    | `useFindDescendants`、`useCountDescendants`、`useFindAncestors`、`useCountAncestors`；根入口带 `use client`                                                            |
| 输入类型      | `T extends TreeEntityType`，按具体方法取 `EntityStaticType<T, '…Options'>`，保留常量/factory                                                                           |
| 输出          | find：`RxDBResource<InstanceType<T>[]>`，初值 `[]`；count：`RxDBResource<number>`，初值 `0`                                                                            |
| 树语义所有权  | 插件/TreeRepository 拥有 lazy task、层级、移动、删除、QueryCache 禁用；wrapper 不改 ID、层级或缓存规则                                                                 |
| 订阅所有权    | `@aiao/rxdb-react` 的 `useRepositoryQuery` 拥有内容身份、layout 代次、active/cleanup、loading/error/empty                                                              |
| provider 边界 | tree hook **不读 context**；只调用传入实体的静态仓储。需换库的 consumer 自己通过 `useRxDB` 选择对应实体，不添加自动重绑定 fallback                                     |
| 发布入口      | 源发布根 `packages/rxdb-plugin-tree-react`；exports 为 `./package.json`、`.`，types/import/default 指向 `dist`                                                         |
| peers         | `@aiao/rxdb`、`@aiao/rxdb-plugin-tree`、`@aiao/rxdb-react` 各 `*`；`react ^19.3.0`、`rxjs ^7.8.2`。原计划的 React `^19.2.8` 已过时，本任务未改依赖                     |
| 生成来源      | Vite ES bundle + vite-plugin-dts；tree generator 把 `FindTreeOptions<typeof Entity, EntityTreeRuleGroup>` 写入四个静态槽。现存声明/源码 map 已实读，重建确定性尚未测量 |

原受控文件里无生成源码；忽略的 dist 是产物核对，不冒充新 HEAD 的 build 通过。详见 [generated-artifacts.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/generated-artifacts.json)。

## 3. 原 C 逐项任务（最低场景原样保留）

### C1 树查询与输入类型 — partial

- **原动作**：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。
- **原最低场景**：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。
- **已做**：四个 wrapper 保留 entity/options 泛型并仅选择精确静态方法和 []/0 默认值；数字 0 不做真值转换。真实层级/QueryCache 禁用在 tree plugin/Repository，不能由 mock 证明。
- **未核销动作**：controller test/typecheck/consumer；real numeric/string/deep tree and plugin/QueryCache guard evidence paired to actual inputs。

### C2 增量结果与参数切换 — partial

- **原动作**：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。
- **原最低场景**：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。
- **已做**：wrapper 没有增量合并状态机；Repository 注册 tree merge；core 的 content identity + layout/request generation + active cleanup 失效旧请求。仅 options 变化保留 stale value 但 hasValue=false，entity identity 变化复位 []，不是旧树被宣称为新查询成功。
- **未核销动作**：controller unit；real cross-parent move/parent deletion comparisons to full tree query; no unrelated backend matrix required。

### C3 三端 contract 与泄漏 — partial

- **原动作**：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。
- **原最低场景**：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。
- **已做**：三端 root 全部只导出四个同名 hook，method/options/default/result 泛型对称。React/Vue readonly resource 语义字段对齐，Angular 用 Signal 读取；Vue Ref/ComputedRef options 是 native 容器差异，不要求字面类型相同。不能把源码对称或三个独立 mock fixture 当作同一真实树运行。
- **未核销动作**：controller offline consumer positive+negative diagnostics；same real fixture state/teardown evidence across three native wrappers。

### C4 React 生命周期与竞态 — partial

- **原动作**：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
- **原最低场景**：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。
- **已做**：四 wrapper 委托同一 core hook；根 StrictMode 真 setup-cleanup-setup 的计数、layout 清理窗口和多 root/entity-provider 显式选择已写最小探针。tree hook 自身不读 useRxDB，不增加自动 provider 重定向或 fallback。
- **未核销动作**：controller test + zero-warning lint + typecheck at current new spec SHA。

### C5 React 类型与 render 边界 — partial

- **原动作**：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。
- **原最低场景**：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。
- **已做**：public declaration retains inputs/InstanceType<T> output; missing method/query error is resource.error, non-idempotent/non-serializable options cause explicit render TypeError. identity comparison by content avoids same-value new object/factory resubscriptions; these lifecycle claims require new execution. No new any/TS ignore/Hooks rule suppression.
- **未核销动作**：controller positive exit0 + invalid expected diagnostic anchors, not TS2307 alone；controller unit/lint/typecheck/build public declarations。

共同底线不变：TS strict、无 `any` / 类型忽略 / Hooks lint 屏蔽、TSDoc 与公开类型一致、单一职责、显式错误、无 fallback。测试定义与动态结论分开；不把已分流缺陷当成未完成阅读，也不把缺验证当成通过。

## 4. 有界补证与验收责任

| 请求                      | 主控动作                                                     | 验收点                                                                                                              |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| V1 `test`                 | 串行本包现有＋新增 spec，禁用本地/远程缓存，原 coverage 配置 | 新 spec 10 个场景 + 原有 6 例；逐用例/skip、JUnit、四项指标、真实环境与输入 SHA                                     |
| V2 `lint`                 | `--max-warnings=0`，禁用缓存                                 | 无新增 warning / rule suppression                                                                                   |
| V3 `typecheck`            | 真实 resolved target（含 build/上游依赖）                    | 新 spec 与原泛型 fixture 进入编译；不能靠 Vitest 两个空函数 expect 证明类型                                         |
| V4 `build`                | 稳定输入生成 dist，并比较重复构建输出 SHA                    | root JS/d.ts/四签名、peers external、use client、生成确定性                                                         |
| V5 独立 consumer          | 离线装真实 tarball+公开 peers，无 workspace paths/symlink    | valid 成功；invalid 在登记十个错误表达式上给语义诊断，不能只有 TS2307；hook 只 typecheck，无顶层运行调用            |
| V6 真实 tree/三端 fixture | 原 C1/C2/C3 的真实仓储与同一 fixture 对照                    | numeric/string、深树、缺插件、QueryCache、跨父移动/父删除/空树/destroy 与全量 query 一致；三端公开 state/多实例释放 |

V5/V6 是主控编排步骤，**不是本包现成 Nx target**；不执行猜测的 `nx run …:independent-…`。详细参数/criticalForC：[validation-requests.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/validation-requests.json)。主控日志：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation`。

补证输入：

- [/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/**tests**/review-round2-lifecycle.spec.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/review-round2-lifecycle.spec.ts)：可控 Observable；root StrictMode 真 setup/cleanup 次数、快速参数/layout 窗口、卸载/多 root/provider 显式实体选择、同值对象/factory、missing method/错误透明。**不是 SQL/真实移动删除 fixture**。
- [consumer-valid.mts](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-valid.mts) / [consumer-invalid.mts](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-invalid.mts)：真实包名进口，numeric/string IDs、四方法 options/返回泛型；手写声明 fixture 对齐已读生成槽协议，未声称本任务生成了客户端。
- [consumer-contract.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/consumer-contract.json)：正向契约与十个负向诊断锚点；不在模块顶层调用 hook。

## 5. 已有证据可复用的精确边界

第一轮本包 3 test files / 6 tests 通过；`statements/branches/functions/lines` 均 **100%**，本包阈值各项 ≥ **80%**。测量只有 9 statements、4 functions、0 branches（0/0）、9 lines 的 thin wrapper，不能证明 TreeRepository/consumer/UI 语义。

现有覆盖率快照中本包 11 个输入和已选读的 8 个依赖接口 SHA 当前仍一致；未比对完整依赖树与根编译配置/lockfile，且新增 spec 不在旧测量中。旧 lint/typecheck 无缓存绿仅适用于当时的真实测量面。旧实际 tarball 10 文件、入口缺失 0、独立 root ESM resolve 通过，**不是 typed consumer / runtime import**。

本 worker 仅跑 read-only `nx show project`、三个新 TS 文件 syntax parsing 和限定文件格式化；没有 build/test/coverage/e2e/server/容器。Angular 工具只识别 examples Angular 21 workspace，未识别此 Nx 包；get_best_practices 返回 Unexpected response type，已记录，不把工具失败当业务失败。

完整来源/缓存/HEAD/skip/四指标：[validation-observations.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/validation-observations.json)。

## 6. 原全对象完成条件逐条判定

- [x] **F1** 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。 —— met；13/13 full content; 615 lines, every concern and interval in file-inspection.json。
- [x] **F2** 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。 —— met-for-reporting-not-C-closure；c-evidence.json preserves original actions/minimum scenes and remaining actions; 0/5 complete。
- [ ] **F3** 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。 —— partial；production anchors and old exact run surface recorded; new probes only syntax parsing, no new dynamic assertions claimed。
- [ ] **F4** 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。 —— partial；historical command/cache/input/100% four metrics recorded, branches 0/0; current new test/lint/typecheck/build results absent。
- [ ] **F5** 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。 —— partial；public 3-wrapper/types and generator static-slot protocol checked; same real tree three-framework fixture and independent consumer compilation pending。
- [x] **F6** 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。 —— met-with-no-new-findings；findings.pending.md; existing registry inspected, unrelated RV069/070 not charged to tree wrapper; no new RV allocated。
- [ ] **F7** 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分评审完成和修复/发布就绪；本计划勾选完成不代表缺陷已经修复。 —— partial；scoped review assessment 🟡 evidence incomplete; no whole-object final grade; reviewComplete=false/releaseReady=false。

**本任务材料交付完成 ≠ 全对象评审完成 ≠ 发布就绪。** 当前 `fullObjectCandidate=false`、`reviewComplete=false`、`releaseReady=false`。不将其他框架专属 router/SFC/模板要求错归此 React 包，也不删 C3 原同 fixture 三端对照要求。

最终由主控把实际测量回填 [closure.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-react/closure.json)；必要未验证分流只能由主控明确裁定，不能由本任务自行改成不适用。

实际对象结果：[rxdb-plugin-tree-react.md](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-tree-react.md)。
