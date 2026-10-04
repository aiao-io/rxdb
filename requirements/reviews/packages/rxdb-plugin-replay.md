---
kind: review-plan
object: rxdb-plugin-replay
source_root: packages/rxdb-plugin-replay
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-replay：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

显式启动的 rrweb 会话录制、独立录制库、回放时间轴及 working-tree commit 恢复联动。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-replay`](../../../packages/rxdb-plugin-replay)        |
| Nx 项目             | `rxdb-plugin-replay`                                                         |
| npm 名称            | `@aiao/rxdb-plugin-replay`                                                   |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 42 个；测试/共享套件入口 15 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/manager.ts`](../../../packages/rxdb-plugin-replay/src/manager.ts)
- [`src/recorder.ts`](../../../packages/rxdb-plugin-replay/src/recorder.ts)
- [`src/store.ts`](../../../packages/rxdb-plugin-replay/src/store.ts)
- [`src/restore.ts`](../../../packages/rxdb-plugin-replay/src/restore.ts)
- [`src/resume.ts`](../../../packages/rxdb-plugin-replay/src/resume.ts)
- [`src/replayer/mount-replayer.ts`](../../../packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts)
- [`README.md`](../../../packages/rxdb-plugin-replay/README.md)
- [`package.json`](../../../packages/rxdb-plugin-replay/package.json)
- [`project.json`](../../../packages/rxdb-plugin-replay/project.json)
- [`src/index.ts`](../../../packages/rxdb-plugin-replay/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-replay/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-replay/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./testing`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-replay.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb-plugin-working-tree: workspace:*`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                    | 最低复验场景 / 证据要求                                                                  | 状态   |
| ---- | ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| C1   | 录制同意与隐私         | 核查默认不录、显式开始/停止、脱敏配置与持久化内容，确认不是仅 UI 隐藏记录。 | 首次安装、敏感输入、停止后继续操作、未授权页面；禁录时没有事件进入录制库。               | 已核查（包级契约，应用授权另审） |
| C2   | 录制库隔离与配额       | 追踪独立库、写队列、chunk/时间戳、清理与限额；不能污染业务 DB。             | 存储失败、长会话、重复事件、重开恢复、配额满；失败可见且业务库不多录制行。               | 待核查 |
| C3   | 时间轴与 commit marker | 审查 marker 的分支/commit 身份和回放顺序，不把时间近似当作同一提交。        | 跨分支、同时间点多 marker、丢事件、不可达 commit；恢复目标可验证。                       | 待核查 |
| C4   | 恢复 / resume 状态机   | 追踪回放点击到 working-tree restore 的拒绝/成功，确保不偷偷移动 HEAD。      | dirty tree、CAS 失效、重复恢复、恢复中取消、断开 DB；语义与工作树公开接口一致。          | 待核查 |
| C5   | 动态 rrweb 与卸载      | 检查精确版本资源、懒加载、mount/unmount、错误恢复与三端 parity suite。      | 未打开回放无回放依赖加载、加载失败、重复 mount/unmount、停止录制后卸载；无后台录制残留。 | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **15** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/restore.spec.ts`](../../../packages/rxdb-plugin-replay/src/__tests__/restore.spec.ts)
- [`src/__tests__/manager.spec.ts`](../../../packages/rxdb-plugin-replay/src/__tests__/manager.spec.ts)
- [`src/__tests__/recorder.spec.ts`](../../../packages/rxdb-plugin-replay/src/__tests__/recorder.spec.ts)
- [`src/__tests__/replayer-parity.spec.ts`](../../../packages/rxdb-plugin-replay/src/__tests__/replayer-parity.spec.ts)
- [`src/__tests__/replayer.browser.spec.ts`](../../../packages/rxdb-plugin-replay/src/__tests__/replayer.browser.spec.ts)
- [`src/__tests__/resume.spec.ts`](../../../packages/rxdb-plugin-replay/src/__tests__/resume.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-replay/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`rxdb-plugin-replay-angular`](rxdb-plugin-replay-angular.md)、[`rxdb-plugin-replay-react`](rxdb-plugin-replay-react.md)、[`rxdb-plugin-replay-vue`](rxdb-plugin-replay-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`rxdb-devtools`](rxdb-devtools.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)。

**回放联审**：[`rxdb-plugin-replay-angular`](rxdb-plugin-replay-angular.md)、[`rxdb-plugin-replay-react`](rxdb-plugin-replay-react.md)、[`rxdb-plugin-replay-vue`](rxdb-plugin-replay-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：真实 DOM/rrweb 与 browser suite，另需 working-tree 真实数据库；用脱敏合成页面，不录用户真实页面。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target      | 用途与证据边界                                                         |
| -------------- | ---------------------------------------------------------------------- |
| `lint`         | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`    | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`         | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`        | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `test-browser` | 显式浏览器运行时补证；检查 provider、include、环境与清理。             |
| `coverage`     | 项目专用覆盖率流程；核对是否合并不同运行时、产物是否当轮生成。         |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-plugin-replay --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-replay:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-replay --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-replay:coverage --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-replay:test-browser --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-replay
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-replay.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：第二批实际深审

[本对象实际结论与证据](../results/packages/rxdb-plugin-replay.md) · [2026-10-04 执行台账](../execution-2026-10-04.md)。只核销明确标识的包级专题；不把平台 skip、历史绿色门禁或不适用授权边界当成应用已通过。
