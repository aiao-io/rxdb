---
kind: review-plan
object: rxdb-plugin-workspace
source_root: packages/rxdb-plugin-workspace
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-workspace：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

未入库 NEW 实体草稿的内存/IndexedDB 恢复与同源广播；不是 working tree。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-workspace`](../../../packages/rxdb-plugin-workspace)  |
| Nx 项目             | `rxdb-plugin-workspace`                                                      |
| npm 名称            | `@aiao/rxdb-plugin-workspace`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 17 个；测试/共享套件入口 4 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBPluginWorkspace.ts`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts)
- [`src/workspace-entry.ts`](../../../packages/rxdb-plugin-workspace/src/workspace-entry.ts)
- [`src/workspace-store.ts`](../../../packages/rxdb-plugin-workspace/src/workspace-store.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-workspace/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-workspace/README.md)
- [`package.json`](../../../packages/rxdb-plugin-workspace/package.json)
- [`project.json`](../../../packages/rxdb-plugin-workspace/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-workspace/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-workspace/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-workspace.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                          | 最低复验场景 / 证据要求                                                                 | 状态   |
| ---- | ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| C1   | NEW 草稿边界           | 对照 README 与事件监听，核查仅 NEW 草稿、不承诺 UPDATE buffer/DELETE 撤销的语义。 | NEW 顶层修改、save(CREATE)、REMOVE/discard、已有实体修改；主表不因缓存操作被写入。      | 待核查 |
| C2   | install / ready 状态机 | 检查 IndexedDB 首次载入、未注册实体恢复、失败后的显式重试。                       | 读取失败、未知 EntityType、重复 install、关闭中 ready；reject 可见，不后台无限重试。    | 待核查 |
| C3   | flush 写屏障           | 审查待写/待删集合、失败后恢复与 WorkspaceFlushError 点名。                        | 部分不可克隆值、写失败、并发修改/flush、再次显式重试；可克隆项与失败项正确区分。        | 待核查 |
| C4   | 快照与跨标签页         | 核查 structuredClone、BroadcastChannel 身份、重复/乱序与同步错误清理。            | 改 list 快照不改内部草稿、同源双页、不同库、损坏记录；corruptedEntries 只反映当前问题。 | 待核查 |
| C5   | 生命周期与持久化证明   | 检查 listener/IDB/broadcast 销毁与 package 子入口，不用内存测试代替重开恢复。     | 浏览器 test-browser 刷新/重开、close/reinstall、无法打开 IDB；边界与使用说明一致。      | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **4** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/RxDBPluginWorkspace.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/RxDBPluginWorkspace.spec.ts)
- [`src/__tests__/workspace-store.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/workspace-store.spec.ts)
- [`src/__tests__/public-api-docs.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/public-api-docs.spec.ts)
- [`src/__tests__/workspace.browser.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/workspace.browser.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-workspace/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-model`](rxdb-model.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)。

## 5. 执行命令与环境

前置环境：真实 IndexedDB/BroadcastChannel 浏览器环境；普通 test 的替身不能替代 test-browser 持久化/跨标签页证据。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target      | 用途与证据边界                                                         |
| -------------- | ---------------------------------------------------------------------- |
| `lint`         | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`    | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`         | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`        | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `test-browser` | 显式浏览器运行时补证；检查 provider、include、环境与清理。             |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-plugin-workspace --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-workspace:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-workspace --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-workspace:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-workspace
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-workspace:test-browser --skipRemoteCache --skipNxCache
```

- `test-browser` 与普通 `test` 的运行面分别记录；专用 coverage 流程是否已纳入 browser project 需读配置，未纳入则补独立测量，不拿 Node summary 代证。

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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-workspace.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。
