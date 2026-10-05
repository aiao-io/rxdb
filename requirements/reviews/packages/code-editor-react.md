---
kind: review-plan
object: code-editor-react
source_root: packages/code-editor-react
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# code-editor-react：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

React：共享 CodeMirror 文档/语言契约的框架组件。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/code-editor-react`](../../../packages/code-editor-react)          |
| Nx 项目             | `code-editor-react`                                                          |
| npm 名称            | `@aiao/code-editor-react`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W4 / 中（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 13 个；测试/共享套件入口 2 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/CodeEditor.tsx`](../../../packages/code-editor-react/src/CodeEditor.tsx)
- [`src/index.ts`](../../../packages/code-editor-react/src/index.ts)
- [`README.md`](../../../packages/code-editor-react/README.md)
- [`package.json`](../../../packages/code-editor-react/package.json)
- [`project.json`](../../../packages/code-editor-react/project.json)
- [`tsconfig.lib.json`](../../../packages/code-editor-react/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/code-editor-react/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/code-editor-react.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`react: ^19.2.8`、`react-dom: ^19.2.8`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                     | 核查动作                                                                                                             | 最低复验场景 / 证据要求                                                                               | 状态                                                     |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| C1   | EditorView 所有权与同步  | 核查编辑器只由组件实例创建/释放；共享 document-sync 正确处理外部 value、内部 change 和 selection/IME。               | 空值、外部 value 回写、输入法编辑、重复挂载、只读切换；没有回调循环或输入丢失。                       | 部分核销：事务/所有权（详本轮逐C表）                     |
| C2   | 动态配置竞态             | 追踪语言/主题/扩展重新配置与异步语言装载，不能把旧 loader 结果安装到新 props。                                       | 快速切语言、主题切换、加载失败、卸载中返回；正确报错且不重建文档状态。                                | 部分执行；当轮子面已核实：语言竞态/等价性（详本轮逐C表） |
| C3   | 三端 API / a11y          | 逐项比较 props/options/change/error、aria 与 keyboard，依共享包规范验证，不凭 demo 视觉一致判断。                    | 同一文档编辑序列、键盘焦点、屏幕阅读器属性、大文档；三端输出与错误契约一致。                          | 部分核销：props / DOM a11y / handle（详本轮逐C表）       |
| C4   | React 生命周期与竞态     | 核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。 | StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。                   | 部分核销：普通卸载已核销，StrictMode 待证（详本轮逐C表） |
| C5   | React 类型与 render 边界 | 检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。                                  | typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。 | 部分核销：类型与发布 metadata（详本轮逐C表）             |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **2** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/CodeEditor.spec.tsx`](../../../packages/code-editor-react/src/__tests__/CodeEditor.spec.tsx)
- [`src/__tests__/index.spec.ts`](../../../packages/code-editor-react/src/__tests__/index.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/code-editor-react/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`code-editor`](code-editor.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`website`（集成边界）](../../../website)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**代码编辑器联审**：[`code-editor`](code-editor.md)、[`code-editor-angular`](code-editor-angular.md)、[`code-editor-vue`](code-editor-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：需当前框架的实际 test 配置；模拟 DOM 的组件测试与真实 browser/application 复验分别记录。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                         |
| ----------- | ---------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project code-editor-react --json
CI=true NX_DAEMON=false pnpm nx run code-editor-react:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=code-editor-react --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run code-editor-react:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=code-editor-react
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [ ] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/code-editor-react.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

### 2026-10-04 第七批：编辑器 /文件预览

本轮源码、实际复验和未完成边界：RV-056 三端同步 loader 异常；RV-057 Angular/Vue 的 Blob.text 后归属缺口，React 对照通过。核心覆盖率四项通过不代替整个 C/宿主完成，详见独立执行记录。

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

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/code-editor-react.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/code-editor-react.md`。
