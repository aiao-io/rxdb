---
kind: review-plan
object: dev-rxdb-electron-e2e
source_root: apps/dev-rxdb-electron-e2e
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: not-started
---

# dev-rxdb-electron-e2e：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

打包 Electron 应用的真实持久化、SQLite/PGlite 备份及 DevTools relay/权限测试。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-electron-e2e`](../../../apps/dev-rxdb-electron-e2e)          |
| Nx 项目             | `dev-rxdb-electron-e2e`                                                      |
| npm 名称            | `@aiao/dev-rxdb-electron-e2e`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W6 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 23 个；测试/共享套件入口 15 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 未开始正式评审；业务门禁未执行、覆盖率未测量                                 |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`playwright.config.ts`](../../../apps/dev-rxdb-electron-e2e/playwright.config.ts)
- [`src/packaged-app.ts`](../../../apps/dev-rxdb-electron-e2e/src/packaged-app.ts)
- [`src/devtools-panel-driver.ts`](../../../apps/dev-rxdb-electron-e2e/src/devtools-panel-driver.ts)
- [`src/desktop-persistence.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts)
- [`src/backup-restore.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts)
- [`src/devtools-session-rotation.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/devtools-session-rotation.spec.ts)
- [`package.json`](../../../apps/dev-rxdb-electron-e2e/package.json)
- [`project.json`](../../../apps/dev-rxdb-electron-e2e/project.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-electron-e2e/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                | 核查动作                                                                                    | 最低复验场景 / 证据要求                                                                         | 状态   |
| ---- | ------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| C1   | 打包应用可信来源    | 核查 packaged-app 启动、版本、临时 userData、进程和目录 cleanup，不偷换成 renderer 浏览器。 | 冷打包、应用退出/崩溃、第二轮执行、资源缺失；真实 binary/版本/SHA 可证明。                      | 待核查 |
| C2   | 两种 backend 持久化 | 对照 SQLite 与 PGlite 各自 specs 的多窗口/独占前置和 DB 路径。                              | 写后完整退出重启、错误路径、并发窗口、worker 故障；两种 backend 不能互相代证。                  | 待核查 |
| C3   | 备份与文件 mutation | 审查真实 DB/file 操作、恢复中断、目标冲突和 restart persistence。                           | 坏归档、并发 restore、文件写失败、关闭重开；验证旧库仍可用而非只看到 toast。                    | 待核查 |
| C4   | DevTools 安全与会话 | 对照 wire tap、capability、session rotation、unsupported scheme 与 refusals 的正反向断言。  | 错 session/frame、导航、只读 setting、越权 native file、巨型消息；拒绝无副作用。                | 待核查 |
| C5   | 扩展与生产隔离      | 检查扩展加载、MV3 档位、dev/prod build 与 packaged-app 参数。                               | 生产包无调试授权、dev 可显式启用、窗口关开/relay reconnect；mock feasibility 不冒充打包兼容性。 | 待核查 |
| C6   | 稳定性与清理        | 审查 timeout、重试与 orphan process，以及 skip 对最终结论的影响。                           | 单 spec/全套/失败后重复运行；重试暴露 flaky，不以重跑一次绿掩盖确定性竞态。                     | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **15** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/backup-restore.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts)
- [`src/desktop-persistence-pglite.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/desktop-persistence-pglite.spec.ts)
- [`src/desktop-persistence.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts)
- [`src/devtools-session-rotation.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/devtools-session-rotation.spec.ts)
- [`src/devtools-capability-wiring.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/devtools-capability-wiring.spec.ts)
- [`src/devtools-database-events-branch.spec.ts`](../../../apps/dev-rxdb-electron-e2e/src/devtools-database-events-branch.spec.ts)

运行配置：[`playwright.config.ts`](../../../apps/dev-rxdb-electron-e2e/playwright.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

E2E 项目不以 spec 数或场景数折算业务覆盖率；以关键用户旅程、反向场景、实际宿主/平台与 skip 明细验收。生产代码覆盖率归对应应用/包，当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`dev-rxdb-electron`](dev-rxdb-electron.md)、[`rxdb-devtools-extension`](rxdb-devtools-extension.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-electron`](dev-rxdb-electron.md)、[`rxdb-adapter-electron`](../packages/rxdb-adapter-electron.md)。

## 5. 执行命令与环境

前置环境：真实 Electron 安装/打包产物、隔离 userData、平台图形宿主；测试必须清理进程与专用数据目录。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                     |
| ----------- | ------------------------------------------------------------------ |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `e2e`       | 当前 Playwright 全套；记录宿主、浏览器、skip、trace 与数据隔离。   |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-electron-e2e --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-electron-e2e:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck --projects=dev-rxdb-electron-e2e --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-electron-e2e:e2e --skipRemoteCache --skipNxCache
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
