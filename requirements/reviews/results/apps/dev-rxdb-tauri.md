---
kind: review-execution
object: dev-rxdb-tauri
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-tauri：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Tauri Angular WebView、Rust commands/capabilities、native SQLite 与 DevTools 面板集成。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-tauri/src-tauri/tauri.conf.json`](../../../../apps/dev-rxdb-tauri/src-tauri/tauri.conf.json)
- [`apps/dev-rxdb-tauri/src-tauri/capabilities/default.json`](../../../../apps/dev-rxdb-tauri/src-tauri/capabilities/default.json)
- [`apps/dev-rxdb-tauri/src-tauri/capabilities/devtools.json`](../../../../apps/dev-rxdb-tauri/src-tauri/capabilities/devtools.json)
- [`apps/dev-rxdb-tauri/src-tauri/src/lib.rs`](../../../../apps/dev-rxdb-tauri/src-tauri/src/lib.rs)
- [`apps/dev-rxdb-tauri/src/app/local-backend.ts`](../../../../apps/dev-rxdb-tauri/src/app/local-backend.ts)
- [`apps/dev-rxdb-tauri/src/app/rxdb-initializer.ts`](../../../../apps/dev-rxdb-tauri/src/app/rxdb-initializer.ts)
- [`apps/dev-rxdb-tauri/project.json`](../../../../apps/dev-rxdb-tauri/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 backend 选择与资源生命周期：逐档审查 local backend、DB 路径、连接初始化/关闭与不支持配置的明确拒绝。
- [ ] C2 桌面安全边界：从页面到 bridge/invoke/host 核查 session、sender、frame、allowlist 和 privilege；与 adapter 协议双端对照。
- [ ] C3 业务、存储与备份：核查真实 Todo/文件操作、backup-probe、restore 和应用重启，区分 DB 与文件备份范围。
- [ ] C4 DevTools 隔离：检查 fake-provider/probe、调试窗口、relay、settings/files mutation 与开发/生产 gating。
- [ ] C5 打包资源与延迟后端：核查 native 库/WASM/Worker/插件资源、build-devtools 与 audit-lazy-backend；开发 server 通过不代表安装包可用。
- [ ] C6 Tauri 专项：核查 Rust command 注册、每个 window capability、WebView origin、CSP、selfcheck 与面板资源打包。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- [Rust 三目标通过](../../evidence/2026-10-03/full-run/cargo.txt)。
- [backend 延迟加载产物审计通过](../../evidence/2026-10-03/full-run/lazy-backend-audit.txt)。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 续执行：2026-10-03 边界取证

### Angular 组件测试隔离复跑

独立串行无缓存 **32 files / 343 passed**：[日志](../../evidence/2026-10-03/follow-up/dev-rxdb-tauri-isolated.txt)。上轮两个 DesktopLaunchService TestBed 初始化失败本轮未复现，不凭历史红灯改业务服务。

此轮是项目配置的 happy-dom 测试，不是新一轮真实 Tauri 窗口/权限/持久化证明；既有 Rust/conformance/smoke 证据保持原测量面，不外推全平台。完整应用专项仍未完成。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../../evidence/2026-10-05/parallel/integrations/current-gates.json)。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                      | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 backend 选择与资源生命周期 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src/app/setup_rxdb.ts:54-117 localBackends/resolveLocalBackend`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts:262-306 create RxDB/transport`<br>native main与wa preview各自dbName，runtime/强制VFS决定选路；native建立invoke/listen指向当前Webview label，不使用Electron的全局preload。                                                                                                                | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控native冷启动/初始化退出/坏目录/多窗口/关闭重开；browser preview不代验，真实平台缺失保持partial。                                       |
| C2 桌面安全边界               | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/src/lib.rs:408 DesktopHost main白名单`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/commands.rs:142-149 window校验`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/capabilities/default.json:5-12、devtools.json:5-6`<br>宿主显式main白名单；devtools仅core:event，应用自有command仍需Rust身份guard，不能只靠capabilities。router按宿主label查会话归属。                             | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实普通/冒名WebView invoke、旧session/跨窗口SQL/file/巨大消息无副作用，cargo与GUI分开留证。                                           |
| C3 业务、存储与备份           | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts:233-235 archiveOps、268-304 entities/filesystem/adapter`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts:115-139 native备份`<br>实体/文件插件与Tauri transport串联，backup/restore复用真实adapter；native E2E备份声明DATABASE_ONLY并删源库后恢复，不能把storage文件算DB备份。                                                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控Todo/文件真实CRUD、BigInt/binary、目标冲突/restore中断/重启持久化及原库可重开；单纯report字段不代替filesystem对照。                    |
| C4 DevTools 隔离              | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/src/lib.rs:74-79 target_label_of、170-191 devtools_message、388-395 cfg(dev)注册`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts:311-320 provider接线`<br>relay只在main与rxdb-devtools间，未知label拒绝；专用command编译期cfg(dev)，renderer provider配置与真实native文件能力分开。                                                                                                           | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控debug native双WebView/冒名窗口/旧session、release无入口、provider gear readonly/full与文件mutation；静态cfg不当作实际release授权结果。 |
| C5 打包资源与延迟后端         | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src/app/setup_rxdb.ts:54-75 动态backend`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/tauri.conf.json:build.frontendDist/security.csp/bundle.targets`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/src/lib.rs:388-417 dev专用注册/窗口`<br>frontendDist指向当前Angular产物，CSP限制connect-src，devtools注册与资源dev gating可定位；build-devtools/audit-lazy-backend必须当前执行才能证明资源闭环。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控冷tauri-package-dev/release、WASM/Worker/native/面板缺资源、离线安装包启动；TS依赖build不是Rust安装包通过。                            |
| C6 Tauri 专项                 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/src/lib.rs:371-408 invoke_handler/host注册、429-464 WindowDestroyed/Exit`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/capabilities/default.json/devtools.json 窗口名单`<br>command注册明确，window destroyed回收owner，退出close_all；Rust宿主授权与WebView origin/CSP需结合真实driver，而不是只看本轮TS typecheck。                                                                                           | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控cargo-check/clippy/test与两档真实smoke分别补日志；普通窗口调devtools command、transport晚到/关闭与native file操作未核销。              |

证据：[逐C矩阵](../../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
