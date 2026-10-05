---
kind: review-execution
object: dev-rxdb-electron-e2e
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-electron-e2e：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

打包 Electron 应用的真实持久化、SQLite/PGlite 备份及 DevTools relay/权限测试。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`apps/dev-rxdb-electron-e2e/playwright.config.ts`](../../../../apps/dev-rxdb-electron-e2e/playwright.config.ts)
- [`apps/dev-rxdb-electron-e2e/src/packaged-app.ts`](../../../../apps/dev-rxdb-electron-e2e/src/packaged-app.ts)
- [`apps/dev-rxdb-electron-e2e/src/devtools-panel-driver.ts`](../../../../apps/dev-rxdb-electron-e2e/src/devtools-panel-driver.ts)
- [`apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts`](../../../../apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts)
- [`apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts`](../../../../apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts)
- [`apps/dev-rxdb-electron-e2e/src/devtools-session-rotation.spec.ts`](../../../../apps/dev-rxdb-electron-e2e/src/devtools-session-rotation.spec.ts)
- [`apps/dev-rxdb-electron-e2e/package.json`](../../../../apps/dev-rxdb-electron-e2e/package.json)
- [`apps/dev-rxdb-electron-e2e/project.json`](../../../../apps/dev-rxdb-electron-e2e/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `e2e`       | 本轮通过（限定当前配置/平台） | 执行日志       |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 打包应用可信来源：核查 packaged-app 启动、版本、临时 userData、进程和目录 cleanup，不偷换成 renderer 浏览器。
- [ ] C2 两种 backend 持久化：对照 SQLite 与 PGlite 各自 specs 的多窗口/独占前置和 DB 路径。
- [ ] C3 备份与文件 mutation：审查真实 DB/file 操作、恢复中断、目标冲突和 restart persistence。
- [ ] C4 DevTools 安全与会话：对照 wire tap、capability、session rotation、unsupported scheme 与 refusals 的正反向断言。
- [ ] C5 扩展与生产隔离：检查扩展加载、MV3 档位、dev/prod build 与 packaged-app 参数。
- [ ] C6 稳定性与清理：审查 timeout、重试与 orphan process，以及 skip 对最终结论的影响。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：strict lint、typecheck；当轮门禁限定。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项               | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| C1 打包应用可信来源    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/packaged-app.ts:56-96 candidates/resolveExecutable、133-182 sandbox检查`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/playwright.config.ts:20-31 串行worker`<br>只找各OS packaged binary；缺失或Linux沙箱助手不合规会失败，非browser/无沙箱fallback。graph e2e依赖冷package和两份扩展build。                                                                                                                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控本轮真实打包/launch日志与版本/平台；未运行平台不写不适用，已有本机产物存在不等于本轮可信来源。                |
| C2 两种 backend 持久化 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts:109-136 两次launch/文件位置`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/desktop-persistence-pglite.spec.ts:103-120 两次launch/目录数据`<br>SQLite/PGlite各自隔离userData，确认backend名、真实文件/目录和重启count1→2。两档测试不可合并成一个后端的通过。                                                                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控两个spec当前真实GUI结果、异常退出/多窗口/OS权限；本轮没有launch，不凭测试存在给持久化通过。                   |
| C3 备份与文件 mutation | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts:131-188 restore/relaunch/删源库`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts:131-136 文件系统检查/清理`<br>备份用归档bytes/manifest与DATABASE_ONLY，删源目录后在target restore并再普通启动证明真实数据；此路径不自动覆盖native file mutation和损坏归档。                                                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控backup/native-files/storage当前结果；目标在用、坏manifest/tamper、部分file失败、restore中断及OS跨归档仍待证。 |
| C4 DevTools 安全与会话 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/devtools-session-rotation.spec.ts:114-166 establishSession/拒绝旧A、172-217 reload/重开`<br>用A/B UUID不同、结构化session_invalid与B可读面板交叉，较单一UI隐藏有判别力。真实wire/沙箱依赖仍未执行本轮。                                                                                                                                                                                                                                                             | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真沙箱GUI会话轮换、旧frame/释放资源、readonly/full拒绝与native mutation；普通unit不能代证。                   |
| C5 扩展与生产隔离      | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/devtools-extension-loading.spec.ts:55-89 显式dev唯一扩展/production空列表`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/packaged-app.ts:133-182 真沙箱`<br>通过宿主session.extensions枚举对照开发/生产，不只renderer提示；需要真sandbox和MV3扩展。production用继承launchEnv，运行需记录配置避免父进程dev开关污染。                                                                                                                           | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控dev/prod配置隔离、生产包扩展bootstrap/资源检查与unsupported scheme/MV3实际执行；不从regex或浏览器页面证明。   |
| C6 稳定性与清理        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts:62-76 app finally close、135-136 temp清理`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/devtools-session-rotation.spec.ts:192-195 app/server/profile finally`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/playwright.config.ts:22-24 workers/retries`<br>串行worker、独立profile及finally关闭app/server/temp基本收束；仍需launch之前失败/关停失败时的真实资源确认。retries不能抹除首轮失败。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前E2E保留trace/首失败/重试与退出后子进程/端口/profile证据；本轮未实际GUI，不预先判稳定。                    |

证据：逐C矩阵、实际阅读、验证请求、待主控去重候选、历史验证分账。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
