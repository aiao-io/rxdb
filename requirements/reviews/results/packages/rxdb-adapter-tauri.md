---
kind: review-execution
object: rxdb-adapter-tauri
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-tauri：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Tauri TypeScript transport 与 Rust SQLite/file host；双语言共享协议和 conformance。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts`](../../../../packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts)
- [`packages/rxdb-adapter-tauri/src/tauri-host-transport.ts`](../../../../packages/rxdb-adapter-tauri/src/tauri-host-transport.ts)
- [`packages/rxdb-adapter-tauri/src/desktop-json-codec.ts`](../../../../packages/rxdb-adapter-tauri/src/desktop-json-codec.ts)
- [`packages/rxdb-adapter-tauri/rust/src/router.rs`](../../../../packages/rxdb-adapter-tauri/rust/src/router.rs)
- [`packages/rxdb-adapter-tauri/rust/src/session.rs`](../../../../packages/rxdb-adapter-tauri/rust/src/session.rs)
- [`packages/rxdb-adapter-tauri/rust/src/paths.rs`](../../../../packages/rxdb-adapter-tauri/rust/src/paths.rs)
- [`packages/rxdb-adapter-tauri/conformance/rust-adapter-factory.ts`](../../../../packages/rxdb-adapter-tauri/conformance/rust-adapter-factory.ts)
- [`packages/rxdb-adapter-tauri/package.json`](../../../../packages/rxdb-adapter-tauri/package.json)
- [`packages/rxdb-adapter-tauri/project.json`](../../../../packages/rxdb-adapter-tauri/project.json)
- [`packages/rxdb-adapter-tauri/src/index.ts`](../../../../packages/rxdb-adapter-tauri/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 TS / Rust 协议对齐：逐字段对照共用协议、codec、Rust protocol/router/value，核查版本协商、类型范围与错误码。
- [ ] C2 会话、事务与 engine：追踪 session、engine、script 的串行化、所有权与 cleanup，检查请求失败后的事务状态。
- [ ] C3 Rust 文件边界：审查 paths/file/locks 和恢复目标，检查目录边界、逻辑路径、链接和锁释放。
- [ ] C4 真实 Rust conformance：检查 conformance factory/transport 和 build-test-host 的依赖，再跑真实宿主而非 TS mock。
- [ ] C5 加密与备份：核查 TS codec、Rust value 与 encrypted/backup harness 的数据来回，不泄露历史敏感值。
- [ ] C6 发布与应用权限：对照 crate、JS exports、Tauri 应用 commands/capabilities；区分适配器允许与应用授权。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- Rust 三目标通过。
- 真实宿主 conformance 通过。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：strict lint、typecheck；当轮门禁限定。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                 | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 TS / Rust 协议对齐    | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:179-218 listen/request/subscriptionReady`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/commands.rs:208-219 rxdb_desktop_request`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:46-62 createClient`<br>TS以JSON codec调用单command，监听注册有ready；Rust用真实window label并spawn_blocking，promise rejection按panic/host不可达分开。常量/codec未全文双端穷尽，不从TS编译证明Rust。    | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控TS test、Rust cargo与protocol-handshake conformance，巨大blob/BigInt、未知tag、版本差异、panic分类/迟到listen必须实际双端验证。                    |
| C2 会话、事务与 engine   | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/router.rs:104-116 handle_owned、137-166 close_owner/close_all、199-247 reject/remember`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/session.rs:203-239 require_session/take_session`<br>路由归属表不信请求里的owner；跨窗口permission_denied，未知会话session_closed；close_owner先升代次防晚到open登记。Rust session依真实Engine mutex；并非仅TS mock会话。                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控Rust真实事务竞争、关闭/崩溃、锁饥饿/poison、晚到open与执行；全engine 1632行未被默认判审完，本轮没有运行。                                          |
| C3 Rust 文件边界         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/paths.rs:109-113 resolve_database_path`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/file/mod.rs:231-281 canonicalize_partial/resolve_within_root、792-825 write_commit/locks`<br>数据库名先验证再建app-scope目录；文件lexical与canonical双边界；提交失败清临时，锁等待有会话/队列限制。权限边界有实现锚点，不是只看src/index导出。                                                                                                                  | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实Rust穿越/根外symlink/目录失败/磁盘满/原子写，OS权限差异和全file/protocol/locks分支未全部审/测。                                                |
| C4 真实 Rust conformance | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/conformance/rust-host-transport.ts:91-111 requireBinary/startRustHostProcess`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/vite.config.mts:56-74 默认test include`<br>`主控resolved graph test-conformance/build-test-host 目标`<br>conformance确实spawn Rust stdio binary，缺binary硬失败；默认test只include src/tests，不会执行conformance。cargo-test与stdio/共享套件各自不同证据面。                                                                               | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控后补已配置test-conformance（依赖build-test-host）、cargo-test与共享协议/事务/存储/加密套件，记录platform/skip；不得用默认TS test或cargo unit代替。 |
| C5 加密与备份            | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts:74-85 backupStorage/createRestoreTargetClient`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/conformance/tauri-sqlite-backup.spec.ts 已存在，仅清单`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts:115-139 native闭环`<br>备份storageKey按实际databaseName争锁，restore先取得独占target；native E2E区分DATABASE_ONLY并删除源库后restore/relaunch。未声称共享加密套件或Rust backup测试已执行。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实Tauri加密/二进制/BigInt/tamper、restore目标在用/失败重试和原库重开；仅原共享core契约继承不能核销动态。                                         |
| C6 发布与应用权限        | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/package.json:15-29 exports/files、40-43 core依赖`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-tauri/rust/src/commands.rs:142-149 window allowlist`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-tauri/src-tauri/src/lib.rs:371-408 command/host注册`<br>WebView入口与Rust宿主分离；app仅main label进入DesktopHost，不是靠capability JSON隐藏UI就授权；npm入口与crate/安装资源消费仍需单独验证。                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控cargo-check/clippy、dev/release真实WebView、生产CSP/window/command拒绝及pack消费；当前TS lint/typecheck/依赖build不覆盖Rust发布宿主。              |

证据：逐C矩阵、实际阅读、验证请求、待主控去重候选、历史验证分账。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
