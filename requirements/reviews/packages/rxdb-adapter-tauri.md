---
kind: review-plan
object: rxdb-adapter-tauri
source_root: packages/rxdb-adapter-tauri
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-tauri：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Tauri TypeScript transport 与 Rust SQLite/file host；双语言共享协议和 conformance。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-adapter-tauri`](../../../packages/rxdb-adapter-tauri)        |
| Nx 项目             | `rxdb-adapter-tauri`                                                         |
| npm 名称            | `@aiao/rxdb-adapter-tauri`                                                   |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 54 个；测试/共享套件入口 17 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterTauri.ts`](../../../packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts)
- [`src/tauri-host-transport.ts`](../../../packages/rxdb-adapter-tauri/src/tauri-host-transport.ts)
- [`src/desktop-json-codec.ts`](../../../packages/rxdb-adapter-tauri/src/desktop-json-codec.ts)
- [`rust/src/router.rs`](../../../packages/rxdb-adapter-tauri/rust/src/router.rs)
- [`rust/src/session.rs`](../../../packages/rxdb-adapter-tauri/rust/src/session.rs)
- [`rust/src/paths.rs`](../../../packages/rxdb-adapter-tauri/rust/src/paths.rs)
- [`conformance/rust-adapter-factory.ts`](../../../packages/rxdb-adapter-tauri/conformance/rust-adapter-factory.ts)
- [`README.md`](../../../packages/rxdb-adapter-tauri/README.md)
- [`package.json`](../../../packages/rxdb-adapter-tauri/package.json)
- [`project.json`](../../../packages/rxdb-adapter-tauri/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-tauri/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-tauri/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-tauri/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-tauri.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项                  | 核查动作                                                                                 | 最低复验场景 / 证据要求                                                                     | 状态                          |
| ---- | --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| C1   | TS / Rust 协议对齐    | 逐字段对照共用协议、codec、Rust protocol/router/value，核查版本协商、类型范围与错误码。  | 未知 operation、协议版本错、BigInt/binary/null、过大数值、坏 JSON；两端给出一致拒绝。       | 部分核查；见2026-10-05逐C结论 |
| C2   | 会话、事务与 engine   | 追踪 session、engine、script 的串行化、所有权与 cleanup，检查请求失败后的事务状态。      | 多 session 同库、断线、事务中抛错、脚本中多个语句、重复 close；不把局部失败解释成整体成功。 | 部分核查；见2026-10-05逐C结论 |
| C3   | Rust 文件边界         | 审查 paths/file/locks 和恢复目标，检查目录边界、逻辑路径、链接和锁释放。                 | 路径穿越、符号链接、跨根路径、恢复冲突、文件失败；限制在声明 capability 内。                | 部分核查；见2026-10-05逐C结论 |
| C4   | 真实 Rust conformance | 检查 conformance factory/transport 和 build-test-host 的依赖，再跑真实宿主而非 TS mock。 | TS unit、cargo test 与 test-conformance 三份独立证据；共享套件移除同步清调用点。            | 部分核查；见2026-10-05逐C结论 |
| C5   | 加密与备份            | 核查 TS codec、Rust value 与 encrypted/backup harness 的数据来回，不泄露历史敏感值。     | 加密 CRUD、变化日志、坏 envelope、恢复中断、二进制/BigInt 往返；原库与锁状态可复验。        | 部分核查；见2026-10-05逐C结论 |
| C6   | 发布与应用权限        | 对照 crate、JS exports、Tauri 应用 commands/capabilities；区分适配器允许与应用授权。     | 独立包 consumer、打包桌面 app、未授权 WebView invoke；生产不能暴露调试能力。                | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **17** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`conformance/rust-adapter-factory.spec.ts`](../../../packages/rxdb-adapter-tauri/conformance/rust-adapter-factory.spec.ts)
- [`conformance/encrypted-bigint-binary.spec.ts`](../../../packages/rxdb-adapter-tauri/conformance/encrypted-bigint-binary.spec.ts)
- [`conformance/encrypted-change-log.spec.ts`](../../../packages/rxdb-adapter-tauri/conformance/encrypted-change-log.spec.ts)
- [`conformance/encrypted-crud.spec.ts`](../../../packages/rxdb-adapter-tauri/conformance/encrypted-crud.spec.ts)
- [`conformance/encrypted-lifecycle.spec.ts`](../../../packages/rxdb-adapter-tauri/conformance/encrypted-lifecycle.spec.ts)
- [`conformance/encrypted-tamper.spec.ts`](../../../packages/rxdb-adapter-tauri/conformance/encrypted-tamper.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-tauri/vite.config.mts)、[`vitest.conformance.mts`](../../../packages/rxdb-adapter-tauri/vitest.conformance.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-storage`](rxdb-plugin-storage.md)、[`rxdb-test`](rxdb-test.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：Rust/Cargo 与项目声明的宿主依赖；test-conformance 需真实 Rust test host。WebView 权限还要在 dev-rxdb-tauri 复验。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target          | 用途与证据边界                                                         |
| ------------------ | ---------------------------------------------------------------------- |
| `lint`             | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`        | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`             | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`            | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `cargo-check`      | Rust 编译与依赖检查，不代替 WebView / bridge 真实运行。                |
| `cargo-clippy`     | Rust lint；检查当前参数与未处理诊断。                                  |
| `cargo-test`       | Rust 单元/集成测试；不能由 TS mock 推定已通过。                        |
| `build-test-host`  | Tauri conformance 测试宿主；检查当前产物来源。                         |
| `test-conformance` | 真实 Tauri 宿主协议与 SQLite 共享 conformance。                        |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-adapter-tauri --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-tauri:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-tauri --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-tauri:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-tauri
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-tauri:cargo-check --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-tauri:cargo-clippy --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-tauri:cargo-test --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-tauri:test-conformance --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-tauri.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../evidence/2026-10-05/parallel/integrations/current-gates.json)。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                 | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 TS / Rust 协议对齐    | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:179-218 listen/request/subscriptionReady`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/commands.rs:208-219 rxdb_desktop_request`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:46-62 createClient`<br>TS以JSON codec调用单command，监听注册有ready；Rust用真实window label并spawn_blocking，promise rejection按panic/host不可达分开。常量/codec未全文双端穷尽，不从TS编译证明Rust。    | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控TS test、Rust cargo与protocol-handshake conformance，巨大blob/BigInt、未知tag、版本差异、panic分类/迟到listen必须实际双端验证。                    |
| C2 会话、事务与 engine   | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/router.rs:104-116 handle_owned、137-166 close_owner/close_all、199-247 reject/remember`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/session.rs:203-239 require_session/take_session`<br>路由归属表不信请求里的owner；跨窗口permission_denied，未知会话session_closed；close_owner先升代次防晚到open登记。Rust session依真实Engine mutex；并非仅TS mock会话。                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控Rust真实事务竞争、关闭/崩溃、锁饥饿/poison、晚到open与执行；全engine 1632行未被默认判审完，本轮没有运行。                                          |
| C3 Rust 文件边界         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/paths.rs:109-113 resolve_database_path`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/file/mod.rs:231-281 canonicalize_partial/resolve_within_root、792-825 write_commit/locks`<br>数据库名先验证再建app-scope目录；文件lexical与canonical双边界；提交失败清临时，锁等待有会话/队列限制。权限边界有实现锚点，不是只看src/index导出。                                                                                                                  | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实Rust穿越/根外symlink/目录失败/磁盘满/原子写，OS权限差异和全file/protocol/locks分支未全部审/测。                                                |
| C4 真实 Rust conformance | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/conformance/rust-host-transport.ts:91-111 requireBinary/startRustHostProcess`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/vite.config.mts:56-74 默认test include`<br>`主控resolved graph test-conformance/build-test-host 目标`<br>conformance确实spawn Rust stdio binary，缺binary硬失败；默认test只include src/tests，不会执行conformance。cargo-test与stdio/共享套件各自不同证据面。                                                                               | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控后补已配置test-conformance（依赖build-test-host）、cargo-test与共享协议/事务/存储/加密套件，记录platform/skip；不得用默认TS test或cargo unit代替。 |
| C5 加密与备份            | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:74-85 backupStorage/createRestoreTargetClient`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/conformance/tauri-sqlite-backup.spec.ts 已存在，仅清单`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts:115-139 native闭环`<br>备份storageKey按实际databaseName争锁，restore先取得独占target；native E2E区分DATABASE_ONLY并删除源库后restore/relaunch。未声称共享加密套件或Rust backup测试已执行。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实Tauri加密/二进制/BigInt/tamper、restore目标在用/失败重试和原库重开；仅原共享core契约继承不能核销动态。                                         |
| C6 发布与应用权限        | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/package.json:15-29 exports/files、40-43 core依赖`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/commands.rs:142-149 window allowlist`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/src/lib.rs:371-408 command/host注册`<br>WebView入口与Rust宿主分离；app仅main label进入DesktopHost，不是靠capability JSON隐藏UI就授权；npm入口与crate/安装资源消费仍需单独验证。                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控cargo-check/clippy、dev/release真实WebView、生产CSP/window/command拒绝及pack消费；当前TS lint/typecheck/依赖build不覆盖Rust发布宿主。              |

证据：[逐C矩阵](../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
