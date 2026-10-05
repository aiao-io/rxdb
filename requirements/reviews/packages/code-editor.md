---
kind: review-plan
object: code-editor
source_root: packages/code-editor
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# code-editor：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

CodeMirror 三端共享的文档同步、语言解析、动态语言装载与可访问性契约。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/code-editor`](../../../packages/code-editor)                      |
| Nx 项目             | `code-editor`                                                                |
| npm 名称            | `@aiao/code-editor`                                                          |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W4 / 中（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 20 个；测试/共享套件入口 5 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/index.ts`](../../../packages/code-editor/src/index.ts)
- [`src/document-sync.ts`](../../../packages/code-editor/src/document-sync.ts)
- [`src/language-resolution.ts`](../../../packages/code-editor/src/language-resolution.ts)
- [`src/languages.ts`](../../../packages/code-editor/src/languages.ts)
- [`src/accessibility.ts`](../../../packages/code-editor/src/accessibility.ts)
- [`README.md`](../../../packages/code-editor/README.md)
- [`package.json`](../../../packages/code-editor/package.json)
- [`project.json`](../../../packages/code-editor/project.json)
- [`tsconfig.lib.json`](../../../packages/code-editor/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/code-editor/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/code-editor.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项             | 核查动作                                                                            | 最低复验场景 / 证据要求                                                              | 状态                                                         |
| ---- | ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| C1   | 共享文档同步     | 检查外部 value 与内部编辑的比较、回写、selection/IME 保持，不做相同内容的无谓重建。 | 外部连续更新、用户输入同时更新、空文档、Unicode、只读切换；无回写死循环或输入丢失。  | 部分核销：字符串差量已核销（详本轮逐C表）                    |
| C2   | 语言异步竞态     | 核查语言解析、动态 loader、错误类型与过期加载结果，区分未知语言与加载失败。         | A→B 快速切换、A 最后返回、未知语言、模块加载失败；旧配置不能覆盖当前语言。           | 已核销：解析/loader 与竞态子项（详本轮逐C表）                |
| C3   | 配置与跨框架语义 | 列出主题、语言、只读、变更回调和无障碍公共契约，逐一与三个组件对照。                | 相同 options/input 在三端产生同文档/错误/事件；原生 prop 形式差异不掩盖能力缺失。    | 已核销：共享契约及三端基础对照（详本轮逐C表）                |
| C4   | 可访问性与资源   | 核查 shared aria/input contract、扩展构造和可用环境边界。                           | 键盘焦点、IME、屏幕阅读器属性、大文档、重复消费；共享层不创建隐藏全局编辑器。        | 部分核销：纯 a11y helper / 不拥有 view 已核销（详本轮逐C表） |
| C5   | 打包与依赖       | 检查 CodeMirror 依赖边界、语言包按需加载和公开类型独立消费。                        | 仅一种语言 bundle、pack 后导入、缺语言资源、Node 仅导入类型；不靠工作区 alias 过关。 | 部分核销：打包条目/root 解析已核销（详本轮逐C表）            |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **5** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/accessibility.spec.ts`](../../../packages/code-editor/src/__tests__/accessibility.spec.ts)
- [`src/__tests__/document-sync.spec.ts`](../../../packages/code-editor/src/__tests__/document-sync.spec.ts)
- [`src/__tests__/language-resolution.spec.ts`](../../../packages/code-editor/src/__tests__/language-resolution.spec.ts)
- [`src/__tests__/index.spec.ts`](../../../packages/code-editor/src/__tests__/index.spec.ts)
- [`src/__tests__/language-error.spec.ts`](../../../packages/code-editor/src/__tests__/language-error.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/code-editor/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：未记录。

Nx 基线图中的直接消费者：[`code-editor-angular`](code-editor-angular.md)、[`code-editor-react`](code-editor-react.md)、[`code-editor-vue`](code-editor-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**代码编辑器联审**：[`code-editor-angular`](code-editor-angular.md)、[`code-editor-react`](code-editor-react.md)、[`code-editor-vue`](code-editor-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

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
NX_DAEMON=false pnpm nx show project code-editor --json
CI=true NX_DAEMON=false pnpm nx run code-editor:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=code-editor --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run code-editor:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=code-editor
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/code-editor.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

### 2026-10-04 第七批：编辑器 /文件预览

[本轮源码、实际复验和未完成边界](../execution-2026-10-04-editor-frameworks.md)：RV-056 三端同步 loader 异常；RV-057 Angular/Vue 的 Blob.text 后归属缺口，React 对照通过。核心覆盖率四项通过不代替整个 C/宿主完成，详见独立执行记录。

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

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/code-editor.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/code-editor.md`。
