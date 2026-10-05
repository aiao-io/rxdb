---
kind: review-execution
object: dev-rxdb-tauri-e2e
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-tauri-e2e：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Vitest 驱动的真实 Tauri desktop/devtools smoke；不是普通 Playwright e2e 目标。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`apps/dev-rxdb-tauri-e2e/vitest.smoke.mts`](../../../../apps/dev-rxdb-tauri-e2e/vitest.smoke.mts)
- [`apps/dev-rxdb-tauri-e2e/vitest.devtools.mts`](../../../../apps/dev-rxdb-tauri-e2e/vitest.devtools.mts)
- [`apps/dev-rxdb-tauri-e2e/src/packaged-app.ts`](../../../../apps/dev-rxdb-tauri-e2e/src/packaged-app.ts)
- [`apps/dev-rxdb-tauri-e2e/src/desktop-persistence.spec.ts`](../../../../apps/dev-rxdb-tauri-e2e/src/desktop-persistence.spec.ts)
- [`apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts`](../../../../apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts)
- [`apps/dev-rxdb-tauri-e2e/src/devtools-release-isolation.spec.ts`](../../../../apps/dev-rxdb-tauri-e2e/src/devtools-release-isolation.spec.ts)
- [`apps/dev-rxdb-tauri-e2e/package.json`](../../../../apps/dev-rxdb-tauri-e2e/package.json)
- [`apps/dev-rxdb-tauri-e2e/project.json`](../../../../apps/dev-rxdb-tauri-e2e/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 真实宿主与 runner：核查 packaged-app/frontend-server/warm-up 和两套 smoke 配置；区分 frontend 替身与真实 invoke/WebView。
- [ ] C2 SQLite 与文件持久化：审查 DB/file 路径、stored-files、退出重开与原子失败断言。
- [ ] C3 备份恢复：核查 restore 目标锁、坏归档、native 拒绝与应用恢复后的完整数据。
- [ ] C4 WebView / 窗口权限：审查 desktop-webview-capability 与 devtools-window-transport 的身份/授权验证。
- [ ] C5 调试与生产隔离：对照 provider gear、release-isolation、dev/prod binary 资源。
- [ ] C6 结论与环境限定：审查仅 desktop-smoke/devtools-smoke 的真实覆盖、skip 和平台信息，避免编造常规 e2e 目标。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- 两个真实打包 smoke 通过。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

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
