---
kind: review-plan
object: dev-rxdb-vue
source_root: apps/dev-rxdb-vue
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-vue：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Vue 浏览器综合演示，含 composable、SQLite-WASM、树/文件、模型、搜索与工作树页面。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-vue`](../../../apps/dev-rxdb-vue)                            |
| Nx 项目             | `dev-rxdb-vue`                                                               |
| npm 名称            | `@aiao/dev-rxdb-vue`                                                         |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 139 个；测试/共享套件入口 24 个（按文件名，不代表覆盖率）                    |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/main.ts`](../../../apps/dev-rxdb-vue/src/main.ts)
- [`src/app/App.vue`](../../../apps/dev-rxdb-vue/src/app/App.vue)
- [`src/app/composables/useAppService.ts`](../../../apps/dev-rxdb-vue/src/app/composables/useAppService.ts)
- [`src/app/rxdb/setup_rxdb_sqlite-wasm.ts`](../../../apps/dev-rxdb-vue/src/app/rxdb/setup_rxdb_sqlite-wasm.ts)
- [`src/app/composables/useDragDropService.ts`](../../../apps/dev-rxdb-vue/src/app/composables/useDragDropService.ts)
- [`package.json`](../../../apps/dev-rxdb-vue/package.json)
- [`project.json`](../../../apps/dev-rxdb-vue/project.json)
- [`tsconfig.app.json`](../../../apps/dev-rxdb-vue/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-vue/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                | 核查动作                                                                                             | 最低复验场景 / 证据要求                                                                                           | 状态                                                          |
| ---- | ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| C1   | 业务路由与依赖接线  | 逐个 route 对照实体、生成客户端、插件、backend 和页面；大示例也要审初始化/关闭，不只截屏。           | Todo/游标、EntityModel、Tree/Graph、搜索、存储、代码编辑器等实际已有页面逐一进入/离开；不强迫补出另一端专属演示。 | 部分核销：route/bootstrap 静态对照（详本轮逐C表）             |
| C2   | 数据库启动与持久化  | 追踪 setup→connect→provider→destroy、Worker/SharedWorker、DB 命名和 storage 选择；刷新不应偷偷换库。 | 加载失败、刷新重开、多标签页、换 branch、卸载中连接完成；错误可见且监听/worker 收束。                             | 部分核销：默认 sqlite-wasm 初始化（详本轮逐C表）              |
| C3   | 业务写入与一致性    | 核查拖拽移动/批量添加/删除、文件路径、undo/redo、工作树和草稿的真实调用链。                          | 路径冲突、关联写失败、并发操作、CAS 拒绝、撤销/恢复；数据原子性来自核心而非 UI 伪造。                             | 未核销：业务写入专项尚未读完（详本轮逐C表）                   |
| C4   | 输入安全与可访问性  | 逐页审查文件/剪贴板/JSON/snippet 渲染、ObjectURL、键盘、焦点和错误提示。                             | 恶意文件名/HTML、超大文件、搜索高亮、键盘全流程、弹层销毁；不泄露敏感字段。                                       | 部分核销：editor 输入路径，其余页未核销（详本轮逐C表）        |
| C5   | 演示 API 与发布边界 | 核查开发测试接口、fake provider、测试注入与生产 build 的分界，确保应用不是包发布对象。               | 生产包中调试/测试开关和凭证扫描、路由冷启动、WASM/Worker 资源、只按实际能力运行。                                 | 部分核销：demo test API 边界已识别（详本轮逐C表）             |
| C6   | Vue 特有边界        | 沿 composable、reactive/ref/getter、watch、路由和组件销毁审查实体身份与长生命周期服务。              | 输入替换、深改 options、路由往返、卸载中异步任务、搜索展开路径；无快照化或旧订阅回写。                            | 部分核销：框架特有 boot/editor；复杂页面未核销（详本轮逐C表） |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **24** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/app/composables/useDragDropService.spec.ts`](../../../apps/dev-rxdb-vue/src/app/composables/useDragDropService.spec.ts)
- [`src/app/composables/file-manager-contract.spec.ts`](../../../apps/dev-rxdb-vue/src/app/composables/file-manager-contract.spec.ts)
- [`src/app/composables/search-expanded-path.spec.ts`](../../../apps/dev-rxdb-vue/src/app/composables/search-expanded-path.spec.ts)
- [`src/app/composables/tree-menu-contract.spec.ts`](../../../apps/dev-rxdb-vue/src/app/composables/tree-menu-contract.spec.ts)
- [`src/app/composables/useAgGridTheme.spec.ts`](../../../apps/dev-rxdb-vue/src/app/composables/useAgGridTheme.spec.ts)
- [`src/app/composables/useDragDrop.spec.ts`](../../../apps/dev-rxdb-vue/src/app/composables/useDragDrop.spec.ts)

运行配置：[`vite.config.mts`](../../../apps/dev-rxdb-vue/vite.config.mts)、[`vitest.config.ts`](../../../apps/dev-rxdb-vue/vitest.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`code-editor-vue`](../packages/code-editor-vue.md)、[`rxdb`](../packages/rxdb.md)、[`rxdb-adapter-sqlite-core`](../packages/rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-sqlite-wasm`](../packages/rxdb-adapter-sqlite-wasm.md)、[`rxdb-client-generator`](../packages/rxdb-client-generator.md)、[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-model-vue`](../packages/rxdb-model-vue.md)、[`rxdb-plugin-graph`](../packages/rxdb-plugin-graph.md)、[`rxdb-plugin-history`](../packages/rxdb-plugin-history.md)、[`rxdb-plugin-search`](../packages/rxdb-plugin-search.md)、[`rxdb-plugin-search-vue`](../packages/rxdb-plugin-search-vue.md)、[`rxdb-plugin-storage`](../packages/rxdb-plugin-storage.md)、[`rxdb-plugin-tree`](../packages/rxdb-plugin-tree.md)、[`rxdb-plugin-working-tree`](../packages/rxdb-plugin-working-tree.md)、[`rxdb-plugin-working-tree-vue`](../packages/rxdb-plugin-working-tree-vue.md)、[`rxdb-plugin-workspace`](../packages/rxdb-plugin-workspace.md)、[`rxdb-test`](../packages/rxdb-test.md)、[`rxdb-vue`](../packages/rxdb-vue.md)、[`utils`](../packages/utils.md)、[`wujie`（集成边界）](../../../modules/wujie)。

Nx 基线图中的直接消费者：[`dev-rxdb-vue-e2e`](dev-rxdb-vue-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-vue-e2e`](dev-rxdb-vue-e2e.md)。

**三框架演示应用联审**：[`dev-rxdb-angular`](dev-rxdb-angular.md)、[`dev-rxdb-react`](dev-rxdb-react.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：真实浏览器、SQLite-WASM 资源和当前 router；与 Vue E2E 使用相同 build 和 DB scope。

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
NX_DAEMON=false pnpm nx show project dev-rxdb-vue --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-vue:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=dev-rxdb-vue --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-vue:test --coverage --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-vue.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

### 2026-10-04 第七批：编辑器 /文件预览

[本轮源码、实际复验和未完成边界](../execution-2026-10-04-editor-frameworks.md)：RV-056 三端同步 loader 异常；RV-057 Angular/Vue 的 Blob.text 后归属缺口，React 对照通过。核心覆盖率四项通过不代替整个 C/宿主完成，详见独立执行记录。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`dev-rxdb-vue`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：5/142 个 tracked 有实际展示行，4 个全文已展示；未读 137 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题               | 本轮结论                                       | 实际生产路径 / 符号行                                                                                                                                                                                                                                                                                                                                                | 事件时序 / 不变量                                                                                                                  | 测试判别力 / 已用证据                                                                                                                   | 必要未验与补证动作                                                                                                                      |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| C1 业务路由与依赖接线  | 部分核销：route/bootstrap 静态对照             | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/app/App.vue:13-14 setup / provideRxDB`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/router/index.ts:14-19,22-163 connectLocalAdapter / routes`                                                                                                                                                   | search/working-tree 先 connect 再 lazy 页面；CodeEditor 真实包挂载；Angular 专有 failure-archive/replay 不要求另外两端复制。       | 三端路由文件全文已读；本轮只有 editor packages 动态通过，不冒充所有路由 E2E 已执行。                                                    | 未逐页追踪所有实体/插件/backend 与 close；route 清点不是整个应用完成。                                                                  |
| C2 数据库启动与持久化  | 部分核销：默认 sqlite-wasm 初始化              | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/app/rxdb/setup_rxdb_sqlite-wasm.ts:40-106 setup / plugins / init / test API / connector`                                                                                                                                                                                                                     | 模块单例；先 plugins/adapter factory，再 init、test API 与 connector；OPFS 能力探测决定 Worker/SharedWorker，DB 名进入接线。       | 主控应用基础 test 结果尚待补；初始化实际源码已读，没重跑历史 storage/Node 红。                                                          | 所有替代 backend、连接失败/刷新同库/provider destroy/worker 关闭需补；Angular e2e 8200 强制 IDB，React/Vue 能力探测，不能叫三端同档位。 |
| C3 业务写入与一致性    | 未核销：业务写入专项尚未读完                   | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/app/App.vue:13-14 setup / provideRxDB`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/router/index.ts:14-19,22-163 connectLocalAdapter / routes`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/app/rxdb/setup_rxdb_sqlite-wasm.ts:40-106 setup / plugins / init / test API / connector` | 已读 setup 的 search seed 串行创建，仅是启动测试数据，不是拖拽/批量添加/undo/working-tree 用户写入。                               | 不能用 editor 单测或 seed 成功核销本 C；file-manager/tree/storage/working-tree 的实际 mutation/取消路径需后续逐页对照。                 | 必要：批量部分失败、拖拽冲突、undo/redo 恢复数据、草稿跨路由；本轮不新增 scope 或业务探针。                                             |
| C4 输入安全与可访问性  | 部分核销：editor 输入路径，其余页未核销        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/pages/CodeEditorPage.vue:18-28 ref/v-model:value`                                                                                                                                                                                                                                                            | React onChange→state、Vue update:value→ref；Angular demo 是 value-only，内部保留编辑不回写 code signal；三者不是完全同一受控演示。 | 现有 editor E2E 只挂载/初值；Angular 另断言高亮颜色；无键入/IME/selection 证据。                                                        | JSON/snippet/文件剪贴板/ObjectURL/预览取消及页面 a11y 尚未逐页审；editor demo 未传 label，不把 role 可见当可访问名称已验。              |
| C5 演示 API 与发布边界 | 部分核销：demo test API 边界已识别             | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/app/rxdb/setup_rxdb_sqlite-wasm.ts:40-106 setup / plugins / init / test API / connector`                                                                                                                                                                                                                     | setup 调 installSearchDemoTestApi/getE2eDbName 与 DevTools；应用自身是 demo，不据此要求包发布生产用户自动暴露同样入口。            | 主控69 lint/typecheck 当轮绿色仅为配置门禁；没有 production artifact 全局对象/fixture 排除的独立检查。                                  | 审上游 install 函数 gating 与当前 app production bundle 中调试面；已读调用不等 gating 已验证，不把 private demo 与发布包混为一谈。      |
| C6 Vue 特有边界        | 部分核销：框架特有 boot/editor；复杂页面未核销 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/app/App.vue:13-14 setup / provideRxDB`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/router/index.ts:14-19,22-163 connectLocalAdapter / routes`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-vue/src/pages/CodeEditorPage.vue:18-28 ref/v-model:value`                                        | Angular OnPush/zoneless；React 主入口 StrictMode+模块级 DB；Vue setup provide+route hooks；均按框架原生 provider 面对照。          | 包级 lifecycle 不替代应用路由销毁；Angular failure-archive/replay，React 闭包/StrictMode，Vue composable 参数切换没有当轮完整用户证据。 | 必要：路由快速离开重入、错误状态、provider 关闭/异步晚到；应用数量大，清点文件不足全对象结论。                                          |

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/apps/dev-rxdb-vue.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/dev-rxdb-vue.md`。
