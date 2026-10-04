---
kind: review-plan
object: dev-rxdb-angular
source_root: apps/dev-rxdb-angular
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-angular：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Angular 浏览器综合演示，验证核心、多个 SQLite 档位及 UI/插件接线。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-angular`](../../../apps/dev-rxdb-angular)                    |
| Nx 项目             | `dev-rxdb-angular`                                                           |
| npm 名称            | 不适用 / 未声明                                                              |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 212 个；测试/共享套件入口 41 个（按文件名，不代表覆盖率）                    |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/main.ts`](../../../apps/dev-rxdb-angular/src/main.ts)
- [`src/app/app.routes.ts`](../../../apps/dev-rxdb-angular/src/app/app.routes.ts)
- [`src/app/app.service.ts`](../../../apps/dev-rxdb-angular/src/app/app.service.ts)
- [`src/app/pages/file-manager/file-manager-lazy/file-manager-lazy.store.ts`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/file-manager-lazy/file-manager-lazy.store.ts)
- [`src/app/components/branch-manager.ts`](../../../apps/dev-rxdb-angular/src/app/components/branch-manager.ts)
- [`project.json`](../../../apps/dev-rxdb-angular/project.json)
- [`tsconfig.app.json`](../../../apps/dev-rxdb-angular/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-angular/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                | 核查动作                                                                                                     | 最低复验场景 / 证据要求                                                                                           | 状态                              |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| C1   | 业务路由与依赖接线  | 逐个 route 对照实体、生成客户端、插件、backend 和页面；大示例也要审初始化/关闭，不只截屏。                   | Todo/游标、EntityModel、Tree/Graph、搜索、存储、代码编辑器等实际已有页面逐一进入/离开；不强迫补出另一端专属演示。 | 待核查                            |
| C2   | 数据库启动与持久化  | 追踪 setup→connect→provider→destroy、Worker/SharedWorker、DB 命名和 storage 选择；刷新不应偷偷换库。         | 加载失败、刷新重开、多标签页、换 branch、卸载中连接完成；错误可见且监听/worker 收束。                             | 待核查                            |
| C3   | 业务写入与一致性    | 核查拖拽移动/批量添加/删除、文件路径、undo/redo、工作树和草稿的真实调用链。                                  | 路径冲突、关联写失败、并发操作、CAS 拒绝、撤销/恢复；数据原子性来自核心而非 UI 伪造。                             | 部分执行；预览读取一致性 RV-057   |
| C4   | 输入安全与可访问性  | 逐页审查文件/剪贴板/JSON/snippet 渲染、ObjectURL、键盘、焦点和错误提示。                                     | 恶意文件名/HTML、超大文件、搜索高亮、键盘全流程、弹层销毁；不泄露敏感字段。                                       | 待核查                            |
| C5   | 演示 API 与发布边界 | 核查开发测试接口、fake provider、测试注入与生产 build 的分界，确保应用不是包发布对象。                       | 生产包中调试/测试开关和凭证扫描、路由冷启动、WASM/Worker 资源、只按实际能力运行。                                 | 待核查                            |
| C6   | Angular 特有边界    | 核查 Signal/service provider/路由复用、OnPush 更新，以及本应用特有 failure-archive/replay 等页面的真实流程。 | 多个注入 scope、路由往返、无变更检测误刷新、故障归档导入拒绝；与配套 E2E 对照。                                   | 部分执行；预览 async 对照，RV-057 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **41** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/app/pages/file-manager/file-manager-lazy/file-manager-lazy.store.spec.ts`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/file-manager-lazy/file-manager-lazy.store.spec.ts)
- [`src/app/pages/file-manager/utils/tree-file.store.spec.ts`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.spec.ts)
- [`src/app/pages/file-manager/file-manager-construction.spec.ts`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/file-manager-construction.spec.ts)
- [`src/app/pages/file-manager/services/file-drag-drop.service.spec.ts`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/services/file-drag-drop.service.spec.ts)
- [`src/app/pages/file-manager/services/file-path-validator.service.spec.ts`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/services/file-path-validator.service.spec.ts)
- [`src/app/pages/file-manager/services/file-search.service.spec.ts`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/services/file-search.service.spec.ts)

运行配置：[`vite.config.mts`](../../../apps/dev-rxdb-angular/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`angular`（集成边界）](../../../modules/angular)、[`angular-todo`（集成边界）](../../../modules/angular-todo)、[`code-editor-angular`](../packages/code-editor-angular.md)、[`rxdb`](../packages/rxdb.md)、[`rxdb-adapter-sqlite`](../packages/rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-core`](../packages/rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-sqlite-wasm`](../packages/rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](../packages/rxdb-adapter-sqliteai.md)、[`rxdb-adapter-wa-sqlite`](../packages/rxdb-adapter-wa-sqlite.md)、[`rxdb-angular`](../packages/rxdb-angular.md)、[`rxdb-client-generator`](../packages/rxdb-client-generator.md)、[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-model-angular`](../packages/rxdb-model-angular.md)、[`rxdb-plugin-graph`](../packages/rxdb-plugin-graph.md)、[`rxdb-plugin-history`](../packages/rxdb-plugin-history.md)、[`rxdb-plugin-replay`](../packages/rxdb-plugin-replay.md)、[`rxdb-plugin-replay-angular`](../packages/rxdb-plugin-replay-angular.md)、[`rxdb-plugin-search`](../packages/rxdb-plugin-search.md)、[`rxdb-plugin-search-angular`](../packages/rxdb-plugin-search-angular.md)、[`rxdb-plugin-storage`](../packages/rxdb-plugin-storage.md)、[`rxdb-plugin-tree`](../packages/rxdb-plugin-tree.md)、[`rxdb-plugin-working-tree`](../packages/rxdb-plugin-working-tree.md)、[`rxdb-plugin-working-tree-angular`](../packages/rxdb-plugin-working-tree-angular.md)、[`rxdb-plugin-workspace`](../packages/rxdb-plugin-workspace.md)、[`rxdb-test`](../packages/rxdb-test.md)、[`utils`](../packages/utils.md)、[`wujie`（集成边界）](../../../modules/wujie)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular-e2e`](dev-rxdb-angular-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-angular-e2e`](dev-rxdb-angular-e2e.md)。

**三框架演示应用联审**：[`dev-rxdb-react`](dev-rxdb-react.md)、[`dev-rxdb-vue`](dev-rxdb-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：需要真实浏览器、当前 demo 的 WASM 与 Worker 资源；共享 modules 页面属于集成边界，详见总计划范围。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target        | 用途与证据边界                                                         |
| ---------------- | ---------------------------------------------------------------------- |
| `lint`           | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`      | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`           | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`          | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `spec-typecheck` | 应用测试源码独立类型校验；不能只校验生产入口。                         |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-angular --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-angular:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=dev-rxdb-angular --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-angular:test --coverage --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-angular.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 续执行：2026-10-03 边界取证

本批实际源码专题、确认意见和复验结果见 [此对象执行记录](../results/apps/dev-rxdb-angular.md) 与 [续执行汇总](../follow-up-2026-10-03.md)。只核销记录中明确覆盖的 C 项，不把全量门禁或单用例通过当作全对象评审完成。

## 2026-10-04：第二批实际深审

[本对象实际结论与证据](../results/apps/dev-rxdb-angular.md) · [2026-10-04 执行台账](../execution-2026-10-04.md)。只核销明确标识的包级专题；不把平台 skip、历史绿色门禁或不适用授权边界当成应用已通过。

### 2026-10-04 第七批：编辑器 /文件预览

[本轮源码、实际复验和未完成边界](../execution-2026-10-04-editor-frameworks.md)：RV-056 三端同步 loader 异常；RV-057 Angular/Vue 的 Blob.text 后归属缺口，React 对照通过。核心覆盖率四项通过不代替整个 C/宿主完成，详见独立执行记录。
