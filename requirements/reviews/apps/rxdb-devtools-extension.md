---
kind: review-plan
object: rxdb-devtools-extension
source_root: apps/rxdb-devtools-extension
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-devtools-extension：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

浏览器扩展 background/content bridge/devtools ports，以及工作区共享面板的装载与权限。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/rxdb-devtools-extension`](../../../apps/rxdb-devtools-extension)      |
| Nx 项目             | `rxdb-devtools-extension`                                                    |
| npm 名称            | `rxdb-devtools-extension`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 38 个；测试/共享套件入口 7 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/background/background-core.ts`](../../../apps/rxdb-devtools-extension/src/background/background-core.ts)
- [`src/content/bridge-core.ts`](../../../apps/rxdb-devtools-extension/src/content/bridge-core.ts)
- [`src/devtools/devtools-init.ts`](../../../apps/rxdb-devtools-extension/src/devtools/devtools-init.ts)
- [`src/devtools/services/port.service.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/port.service.ts)
- [`src/devtools/services/inspected-page-access.service.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts)
- [`README.md`](../../../apps/rxdb-devtools-extension/README.md)
- [`package.json`](../../../apps/rxdb-devtools-extension/package.json)
- [`project.json`](../../../apps/rxdb-devtools-extension/project.json)
- [`tsconfig.app.json`](../../../apps/rxdb-devtools-extension/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/rxdb-devtools-extension/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                       | 核查动作                                                                                             | 最低复验场景 / 证据要求                                                                              | 状态   |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| C1   | 跨边界消息身份             | 按 inspected tab/frame/document/session 建模 background/content/port route，核查导航与重连身份更新。 | 错 tab/frame、页面伪造、session rotation、port 重连、未知消息；拒绝时不能写 DB/file。                | 待核查 |
| C2   | manifest / CSP / 权限      | 审查 manifest 配置、host permissions、资源暴露和执行 inspected page 的入口。                         | 不支持 scheme、无权限页面、恶意导航、生产 CSP；最小权限，不借调试状态扩大访问。                      | 待核查 |
| C3   | port 队列与生命周期        | 核查反压、超时、请求关联、disconnect 和 listener cleanup。                                           | 快速切 tab、慢页面、巨大消息、扩展 reload、重复 connect；不泄漏 port 或跨 session 晚到响应。         | 待核查 |
| C4   | 面板与 provider capability | 对照 modules/rxdb-devtools-panel 与 rxdb-devtools descriptors，确认 UI 权限提示与实际拒绝一致。      | 只读 provider、危险 file/settings 操作、批量部分失败、敏感 snapshot；权限不能只靠禁用按钮。          | 待核查 |
| C5   | 浏览器 / Electron 档位     | 核查 build-desktop-dev 与标准 extension build 的差异，以及 Chrome/Electron relay conformance。       | 真实 Chromium 扩展、Electron 加载、导航后重连、生产与开发资源；不以单一 chrome mock 宣称全宿主支持。 | 待核查 |
| C6   | 测试可信度与产物           | 将 unit/conformance、extension E2E、packaged Electron 分开；核查测试 hook 与凭证/调试代码隔离。      | 真实 relay.spec 与安装后的 extension、冷启动、准备产物陈旧检测；不发布 fixture。                     | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **7** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/background/background-core.spec.ts`](../../../apps/rxdb-devtools-extension/src/background/background-core.spec.ts)
- [`src/devtools/services/inspected-page-access.service.spec.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.spec.ts)
- [`src/devtools/services/port.service.spec.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/port.service.spec.ts)
- [`src/content/bridge.spec.ts`](../../../apps/rxdb-devtools-extension/src/content/bridge.spec.ts)
- [`src/manifest.config.spec.ts`](../../../apps/rxdb-devtools-extension/src/manifest.config.spec.ts)
- [`src/public-contracts.spec.ts`](../../../apps/rxdb-devtools-extension/src/public-contracts.spec.ts)

运行配置：[`vite.config.ts`](../../../apps/rxdb-devtools-extension/vite.config.ts)、[`vitest.config.ts`](../../../apps/rxdb-devtools-extension/vitest.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-devtools-panel`（集成边界）](../../../modules/rxdb-devtools-panel)。

Nx 基线图中的直接消费者：[`dev-rxdb-electron-e2e`](dev-rxdb-electron-e2e.md)、[`rxdb-devtools-extension-e2e`](rxdb-devtools-extension-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-electron`](dev-rxdb-electron.md)、[`dev-rxdb-tauri`](dev-rxdb-tauri.md)、[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-devtools-extension-e2e`](rxdb-devtools-extension-e2e.md)。

## 5. 执行命令与环境

前置环境：真实 Chromium 扩展加载环境；Electron 档位在 Electron 应用联测。共享面板位于 modules/，纳入集成调用链但不新增独立范围。

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
NX_DAEMON=false pnpm nx show project rxdb-devtools-extension --json
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools-extension:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-devtools-extension --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools-extension:test --coverage --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/rxdb-devtools-extension.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。
