---
kind: review-plan
object: rxdb-plugin-tree-react
source_root: packages/rxdb-plugin-tree-react
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
round2_task: R2-03
round2_source_head: 465f9078e9844af2cbef9936c7321a5576333a01
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-plugin-tree-react：R2-03 有界收尾计划

**2026-10-05：13/13 受控全文、615 行实读完成；补证/文档已交付，新增测试冻结。完整原 C：2/5（C4、C5）；C1–C3 partial。全对象评审/发布未就绪，不扩大业务或新增测试模式。**

## 1. 唯一范围与基线

- 工作区 `/Users/jimmy/Documents/aiao/rxdb`；对象 `packages/rxdb-plugin-tree-react`；Nx `rxdb-plugin-tree-react`；npm `@aiao/rxdb-plugin-tree-react`。
- 原计划基线 `2e820521187cbfcd1fe76fb705659fea0a548f0e`（2026-10-03）；第一轮测量 `44de1138b4d396fc45d6e76ab60476c40fef2223`；R2 源/当前 build-unit-lint HEAD `465f9078e9844af2cbef9936c7321a5576333a01`。
- 13 个 scope 文件 SHA 全匹配，LICENSE/README、全部配置、三份原 spec 均实读；不是仅入口或 hash 清单。原源码/原测试/依赖未修改；只新增本包一份 `review-round2-lifecycle.spec.ts`。
- 写范围仅本计划、本对象结果、本对象证据目录和必要新增 spec；无 Git 状态操作、GUI、发布、server、容器、重任务或嵌套代理。依赖接口/同族三端只读，不扩对象。

全文件/区间/关注点：file-inspection.json。实际 inferred targets：nx-project.json；局部 `project.json` 不代替 resolved config。

## 2. 数据结构、委托与公开边界

| 边界           | 实读结论                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 四个 root 值   | `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`；入口 `use client`                                                             |
| inputs/results | `T extends TreeEntityType`；`EntityStaticType<T,具体 Options key>` / `UseOptions`；find 为 `RxDBResource<InstanceType<T>[]>`/`[]`，count 为 `RxDBResource<number>`/`0` |
| query 所有权   | wrapper 只挑方法名/default；tree plugin/Repository 负责层级、lazy task、增量和 QueryCache 禁用；core React hook 负责订阅/代次/元数据/error/cleanup                     |
| provider       | tree hook 不读 context、不自动换库；消费方用 `useRxDB` 显式选对应实体静态仓储                                                                                          |
| publish        | 源发布根；exports `./package.json`、`.`；types/import/default 到 dist；peer 外置、不携带 spec/buildinfo                                                                |
| peers          | core/tree/react bindings 各 `*`，React `^19.3.0`、RxJS `^7.8.2`；原计划 React `^19.2.8` 已过时，本任务未改依赖                                                         |
| 三端/生成      | root 四名称与 method/default/输入输出泛型对称；Angular Signal、Vue Ref/readonly 与 React snapshot 是 native 容器差异；生成静态槽和实际 MenuSimple.d.ts 已对照          |

source 没有受控生成文件；本包 JS/d.ts/maps 已核对应来源，主控 fresh build 已过，**repeat build 确定性未测**。generated-artifacts.json。

## 3. 原 C 逐项（原动作和最低场景不变）

### C1 树查询与输入类型 — partial

- **原动作**：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。
- **原最低场景**：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。
- **结论**：四个 wrapper 保留 entity/options 泛型并仅选择精确静态方法和 []/0 默认值；数字 0 不做真值转换。真实层级/QueryCache 禁用在 tree plugin/Repository，不能由 mock 证明。
- **剩余原场景**：原最低真实 numeric/string 查询、深树与 plugin/QueryCache 运行链路补证或精准复用。

### C2 增量结果与参数切换 — partial

- **原动作**：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。
- **原最低场景**：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。
- **结论**：wrapper 没有增量合并状态机；Repository 注册 tree merge；core 的 content identity + layout/request generation + active cleanup 失效旧请求。仅 options 变化保留 stale value 但 hasValue=false，entity identity 变化复位 []，不是旧树被宣称为新查询成功。
- **剩余原场景**：原最低 real TreeRepository cross-parent move/parent delete vs full tree query；不等无关后端，不新增模式。

### C3 三端 contract 与泄漏 — partial

- **原动作**：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。
- **原最低场景**：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。
- **结论**：三端 root 全部只导出四个同名 hook，method/options/default/result 泛型对称。React/Vue readonly resource 语义字段对齐，Angular 用 Signal 读取；Vue Ref/ComputedRef options 是 native 容器差异，不要求字面类型相同。不能把源码对称或三个独立 mock fixture 当作同一真实树运行。
- **剩余原场景**：原同一真实 tree fixture 的三端公开 state/多实例释放；上游裸声明问题主控归属，不改依赖。

### C4 React 生命周期与竞态 — 完整

- **原动作**：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
- **原最低场景**：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。
- **结论**：core effect/options identity/cleanup 所有权已实读；主控冻结 newSpec 10/10 验证所有四 hook 的根 StrictMode setup-cleanup-setup、快速 props/layout active 窗口、卸载后晚到与多 root/provider 显式实体选择。全部原最低生命周期场景有实际证据，happy-dom 不是 SQL/真实浏览器矩阵。
- **剩余原场景**：原最低场景证据齐；对象质量/上游/发布剩余见第5–6节。

### C5 React 类型与 render 边界 — 完整（含已定位的上游裸声明缺口）

- **原动作**：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。
- **原最低场景**：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。
- **结论**：原最低 typed consumer/同值新引用/错误 props/重渲染均已取证；严格真实 tarball 正向0、十处错误负向拒绝、root import0，object/factory/errors probes通过且零警告 lint，无 any/TS ignore/Hooks屏蔽。裸环境 @aiao/utils NodeJS/ms 声明失败已明确归上游并保留；补显式类型只证明本包泛型契约，不是发布声明自包含全绿。
- **剩余原场景**：原最低场景证据齐；对象质量/上游/发布剩余见第5–6节。

共同底线保留：TS strict、无 `any` / 类型忽略 / Hooks lint 屏蔽；TSDoc/API 一致、单一职责、显式错误、无 flat fallback。C 的取证完成不代表缺陷已修复，也不代表发布声明自包含。

## 4. 实际主控验证（只引用本包测量面）

- **unit**：2026-10-05 11:07:10 +08:00，happy-dom/Vitest 4.1.11；4 files、16/16（10 新＋6 原）通过，无本包 skip；本包测量 12 输入 SHA 与当前一致，新 spec SHA `e138ed22e843ac7bfdca1f83628684caf30179512fcf71d121bf2e7dff7ce9ec`。
- **coverage**：S/B/F/L 全100%，分母9/0/4/9（branches 0/0），各项阈值≥80；只覆盖 thin wrapper，不覆盖真实 SQL/tree/core 状态机。
- **build/lint**：主控串行、禁本地/远程缓存，build通过；lint `--max-warnings=0` 通过。聚合 unit exit1 不覆盖本包的16/16。
- **独立 real tar consumer**：2026-10-05 11:04:13 +08:00，strict、skipLibCheck:false、无 workspace aliases/links；补显式 `node` 与 `@types/ms 2.1.0` 后 valid0、invalid十处匹配消费错误、root import0（四个导出）。fixture SHA 全匹配。
- **裸失败保留**：10:58:02 +08:00 valid/invalid 包含上游 `@aiao/utils` NodeJS/ms 声明错误。补类型成功不证明发布声明自包含、不隐藏裸失败；归主控上游定责，不改本包依赖。
- **尚未测**：new spec 的 TS 语义编译（unit 转译/库 build 不等于 test typecheck）、repeat build/hash、C1–C3 原真实 tree/同 fixture 三端链路。新测试不再改，不等所有 big 包。

实测命令/日期/input/caches/typed对照：controller-validation.json。历史第一轮证据与新结果边界：validation-observations.json。

## 5. 六项验证请求的当前状态

| 请求                      | 状态                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| V1 test/coverage          | 本包16/16与四指标通过；JUnit文件未观察，stdout/coverage有实证                 |
| V2 lint                   | 零警告通过                                                                    |
| V3 typecheck              | new spec 语义质量门禁仍交主控；不新增模式、不等大包                           |
| V4 build                  | fresh build通过；重复生成/hash未测                                            |
| V5 independent consumer   | 显式 ambient 环境的严格正反和 root import通过；裸上游声明失败保留，非自包含绿 |
| V6 real tree same fixture | 原 C1–C3 必要证据仍未完成，可精确复用已有 upstream，不跑无关矩阵              |

V5/V6 是主控编排步骤，不是本包 Nx target；不运行猜测 target。validation-requests.json。

冻结输入：[新增生命周期 spec](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/__tests__/review-round2-lifecycle.spec.ts)，consumer-valid.mts / consumer-invalid.mts。consumer 仅在未调用函数体里使用 hook，无顶层 runtime 调用、无 any/ignore；consumer-contract.json。

## 6. 原对象完成条件逐条判定

- [x] **F1 met**：全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。 —— 13/13 full content; 615 lines, every concern and interval in file-inspection.json。
- [x] **F2 met-for-reporting-not-C-closure**：每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。 —— c-evidence.json: C4/C5 full original-minimum evidence; C1-C3 partial; whole object not completed。
- [x] **F3 met-for-reported-evidence**：不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。 —— production anchors + exact controller commands/environment/current frozen input SHA; dynamic claims scoped to actual own results。
- [ ] **F4 partial**：实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。 —— current build/lint/16 unit + four 100% metrics/cache/skip/input recorded; new spec semantic typecheck and JUnit not observed; repeated determinism not measured。
- [ ] **F5 partial**：上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。 —— public native three-wrapper types/generator protocol/real tarball consumers checked; original same real-tree three-framework fixture pending; bare utils gap upstream-owned。
- [x] **F6 met-with-no-new-findings**：确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。 —— no new own finding/RV; confirmed bare utils NodeJS/ms gap explicitly upstream-owned, ambient comparison retained。
- [ ] **F7 partial**：形成 🟢 / 🟡 / 🔴 的有证据结论，并区分评审完成和修复/发布就绪；本计划勾选完成不代表缺陷已经修复。 —— scoped review assessment 🟡 evidence incomplete; no whole-object final grade; reviewComplete=false/releaseReady=false。

**工作材料交付完成 ≠ 全对象评审完成 ≠ 发布就绪**：`workerDeliveryComplete=true`，`completeCCount=2/5`，`fullObjectCandidate=false`、`reviewComplete=false`、`releaseReady=false`。必要未验证分流只能由主控明确裁定；不自己标不适用、不将其他框架 router/SFC/模板要求错归本 React 包。

实际结果：[对象执行记录](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-tree-react.md)。最终机器交付：closure.json / c-evidence.json。冻结新 spec，只交文档并释放本任务，不等后续 queued 包。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

真实tar类型正负/运行时证据、十包本轮test/四指标、后四组及修正树夹具复验、新增spec独立严格类型。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。

## 主控规范化专项索引（保留原最低场景）

| 编号 | 专题                     | 原计划动作                                                                                                           | 原最低场景                                                                                            | 最终状态                               |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| C1   | 树查询与输入类型         | 对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。                          | numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。            | 部分执行；原真实树/三端场景未验        |
| C2   | 增量结果与参数切换       | 核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。                                             | 跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。                                        | 部分执行；原真实树/三端场景未验        |
| C3   | 三端 contract 与泄漏     | 逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。                                             | 同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。                    | 部分执行；原真实树/三端场景未验        |
| C4   | React 生命周期与竞态     | 核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。 | StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。                   | 已核查；完整原C，见R2证据/发布上游风险 |
| C5   | React 类型与 render 边界 | 检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。                                  | typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。 | 已核查；完整原C，见R2证据/发布上游风险 |
