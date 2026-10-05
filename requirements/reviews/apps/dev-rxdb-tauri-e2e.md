---
kind: review-plan
object: dev-rxdb-tauri-e2e
source_root: apps/dev-rxdb-tauri-e2e
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-tauri-e2e：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Vitest 驱动的真实 Tauri desktop/devtools smoke；不是普通 Playwright e2e 目标。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-tauri-e2e`](../../../apps/dev-rxdb-tauri-e2e)                |
| Nx 项目             | `dev-rxdb-tauri-e2e`                                                         |
| npm 名称            | `@aiao/dev-rxdb-tauri-e2e`                                                   |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W6 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 17 个；测试/共享套件入口 7 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`vitest.smoke.mts`](../../../apps/dev-rxdb-tauri-e2e/vitest.smoke.mts)
- [`vitest.devtools.mts`](../../../apps/dev-rxdb-tauri-e2e/vitest.devtools.mts)
- [`src/packaged-app.ts`](../../../apps/dev-rxdb-tauri-e2e/src/packaged-app.ts)
- [`src/desktop-persistence.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/desktop-persistence.spec.ts)
- [`src/desktop-backup-restore.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts)
- [`src/devtools-release-isolation.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/devtools-release-isolation.spec.ts)
- [`package.json`](../../../apps/dev-rxdb-tauri-e2e/package.json)
- [`project.json`](../../../apps/dev-rxdb-tauri-e2e/project.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-tauri-e2e/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                | 核查动作                                                                                               | 最低复验场景 / 证据要求                                                                           | 状态                          |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| C1   | 真实宿主与 runner   | 核查 packaged-app/frontend-server/warm-up 和两套 smoke 配置；区分 frontend 替身与真实 invoke/WebView。 | 实际 Tauri binary 启动、冷资源、失败 cleanup；只跑浏览器页面不算桌面证据。                        | 部分核查；见2026-10-05逐C结论 |
| C2   | SQLite 与文件持久化 | 审查 DB/file 路径、stored-files、退出重开与原子失败断言。                                              | 写后重启、部分文件失败、同路径冲突、越界路径；实际 filesystem/DB 状态可查。                       | 部分核查；见2026-10-05逐C结论 |
| C3   | 备份恢复            | 核查 restore 目标锁、坏归档、native 拒绝与应用恢复后的完整数据。                                       | 恢复中断、目标在用、坏 manifest、重复 restore；旧库能继续打开。                                   | 部分核查；见2026-10-05逐C结论 |
| C4   | WebView / 窗口权限  | 审查 desktop-webview-capability 与 devtools-window-transport 的身份/授权验证。                         | 普通窗口 invoke 特权命令、session 过期、窗口导航/关闭；Rust 层拒绝而非 UI 层隐藏。                | 部分核查；见2026-10-05逐C结论 |
| C5   | 调试与生产隔离      | 对照 provider gear、release-isolation、dev/prod binary 资源。                                          | 生产包不含未授权调试入口、dev 显式开关、capability 缺失、native provider 文件操作；两档独立复验。 | 部分核查；见2026-10-05逐C结论 |
| C6   | 结论与环境限定      | 审查仅 desktop-smoke/devtools-smoke 的真实覆盖、skip 和平台信息，避免编造常规 e2e 目标。               | 两套 Nx 目标各留日志；未运行平台/权限场景明确未验证，不能从 cargo test 代证 WebView。             | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **7** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/devtools-release-isolation.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/devtools-release-isolation.spec.ts)
- [`src/desktop-backup-restore.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts)
- [`src/desktop-persistence.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/desktop-persistence.spec.ts)
- [`src/devtools-provider-gear.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/devtools-provider-gear.spec.ts)
- [`src/devtools-window-transport.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/devtools-window-transport.spec.ts)
- [`src/desktop-file-storage.spec.ts`](../../../apps/dev-rxdb-tauri-e2e/src/desktop-file-storage.spec.ts)

运行配置：[`vitest.devtools.mts`](../../../apps/dev-rxdb-tauri-e2e/vitest.devtools.mts)、[`vitest.smoke.mts`](../../../apps/dev-rxdb-tauri-e2e/vitest.smoke.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

E2E 项目不以 spec 数或场景数折算业务覆盖率；以关键用户旅程、反向场景、实际宿主/平台与 skip 明细验收。生产代码覆盖率归对应应用/包，当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`dev-rxdb-tauri`](dev-rxdb-tauri.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-tauri`](dev-rxdb-tauri.md)、[`rxdb-adapter-tauri`](../packages/rxdb-adapter-tauri.md)。

## 5. 执行命令与环境

前置环境：项目 smoke 配置要求的 Tauri binary/平台宿主、Rust 构建和图形/WebView 环境；只用隔离数据目录。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target        | 用途与证据边界                                                     |
| ---------------- | ------------------------------------------------------------------ |
| `lint`           | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck`      | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `desktop-smoke`  | Tauri release 宿主 smoke；必须保留平台和打包产物信息。             |
| `devtools-smoke` | Tauri 开发调试宿主 smoke；不能替代 release 隔离证据。              |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-tauri-e2e --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-tauri-e2e:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck --projects=dev-rxdb-tauri-e2e --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-tauri-e2e:desktop-smoke --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-tauri-e2e:devtools-smoke --skipRemoteCache --skipNxCache
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [x] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-tauri-e2e.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：strict lint、typecheck；当轮门禁限定。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项               | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C1 真实宿主与 runner   | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/packaged-app.ts:479-495 resolveExecutable、524-566 spawn/timeout、576-601 report校验`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/vitest.smoke.mts:26-37 include/exclude/globalSetup`<br>runner spawn release/debug真实Tauri binary，不用纯浏览器替身；缺binary/报告/schemaVersion错误显式失败，超时SIGKILL。frontend-server是probe辅助，不是GUI替代。                                                                                                  | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控desktop-smoke和devtools-smoke各自真实启动来源/平台日志；不从存在报告文件或TS编译判断native通过。                         |
| C2 SQLite 与文件持久化 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/desktop-persistence.spec.ts:35-69 真文件/真实appDataDir/重启`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/stored-files.ts collectStoredFiles/sha256OfFile（清单，未全文）`<br>持久化用native退出码、report的实际host appDataDir、文件存在和第二次count交叉。stored-files入口只盘点，未声称全部file mutation断言已人工/动态完成。                                                                                                                    | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控native SQLite/file两路径、部分文件失败/越界/同路径冲突与实际bytes/hash；本轮未跑真实filesystem，不能给完整C2通过。       |
| C3 备份恢复            | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts:115-170 备份/删源/restore/配置拒绝、174-197 跨OSskipIf`<br>备份同时看归档size/manifest scope与源文件，删源后target恢复；已有归档拒绝且不改stale bytes。跨OS依IMPORT_DIR缺失明确skip，不能计入本轮通过。                                                                                                                                                                                                                                   | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前backup/restore、中断/坏归档/target在用与旧库可继续开；跨OS归档未供应则记录未验证，不标平台不适用。                   |
| C4 WebView / 窗口权限  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/desktop-webview-capability.spec.ts:77-120 real probe server、155-168 platform期望`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/commands.rs:142-149 授权实现`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src-tauri/src/lib.rs:170-191 relay guard`<br>WebView probe服务器有allowed/denied对照和platform差异，不从WebView API可用推导SQL/window权限。权限真正实现是Rustwindow guard；所读片段不覆盖全部session/relay攻击。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控普通/冒名窗口特权command、旧session/导航/关窗、真实Rust拒绝及副作用检查；mac/linux/win行为须分别实际证据，未跑仍未验证。 |
| C5 调试与生产隔离      | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/devtools-release-isolation.spec.ts:53-117 capability/cfg regex与cargo-check`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/vitest.devtools.mts:26 include devtools-window/provider`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src-tauri/src/lib.rs:388-395 编译期隔离`<br>release-isolation部分是结构/regex和cargo-check，不是release WebView授权实测；devtools smoke是另一个debug binary目标，provider真/假档需独立确认。             | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控dev/release双binary、production无入口/资源/command、capability缺失与native provider；cargo成功不能代GUI。                |
| C6 结论与环境限定      | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/vitest.smoke.mts:26-45 全spec排除两dev例、vitest.devtools.mts:26-32 仅两dev例`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts:174-197 crossOS skipIf`<br>两target覆盖边界已区分，default smoke与devtools不是普通e2e目标；跨OSskip/env限定必须逐项报告。当前strict lint/typecheck过，不预先写cargo/native smoke已过。                                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控后补两target实际logs/skip/失败/重跑/platform；未覆盖原完成条件维持partial。                                              |

证据：逐C矩阵、实际阅读、验证请求、待主控去重候选、历史验证分账。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
