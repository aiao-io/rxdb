---
kind: review-execution
object: rxdb-adapter-electron
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-electron：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Electron 桌面 SQLite 与 PGlite adapter/host；两种后端的锁与多窗口语义分别核查。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts`](../../../../packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts)
- [`packages/rxdb-adapter-electron/src/electron-sqlite-host.ts`](../../../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts)
- [`packages/rxdb-adapter-electron/src/electron-file-host.ts`](../../../../packages/rxdb-adapter-electron/src/electron-file-host.ts)
- [`packages/rxdb-adapter-electron/src/node-sqlite-engine.ts`](../../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts)
- [`packages/rxdb-adapter-electron/src/pglite/RxDBAdapterElectronPGlite.ts`](../../../../packages/rxdb-adapter-electron/src/pglite/RxDBAdapterElectronPGlite.ts)
- [`packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts`](../../../../packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts)
- [`packages/rxdb-adapter-electron/package.json`](../../../../packages/rxdb-adapter-electron/package.json)
- [`packages/rxdb-adapter-electron/project.json`](../../../../packages/rxdb-adapter-electron/project.json)
- [`packages/rxdb-adapter-electron/src/index.ts`](../../../../packages/rxdb-adapter-electron/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 renderer / host 边界：逐个对照 sqlite-core 协议、TS host 和应用 preload；请求必须归属到正确会话与数据库。
- [ ] C2 SQLite 多窗口与事务：审查 node:sqlite engine、事务请求队列、关闭/崩溃时资源收束。
- [ ] C3 PGlite 独占与可选 peer：检查 PGlite data-dir lock/runtime 与 optional peer 的按需装载；不套用 SQLite 多窗口假设。
- [ ] C4 文件与路径安全：追踪 storage 根路径、logical path、符号链接和请求边界；与插件 storage 和 DevTools provider 联审。
- [ ] C5 加密与备份恢复：审查 SQLite/PGlite 各自备份锁、restore 事务和 keyring；按不同后端分别记录证据。
- [ ] C6 host 与应用集成：将 adapter 单测、应用 electron-conformance 与 packaged E2E 接起来；单纯浏览器 demo 不算桌面证据。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

C1/C2/C6 **部分执行**。实际 Electron SQLite adapter/client/host 使用临时 node:sqlite 文件，native DatabaseSync 第二只只读连接直接核对已提交行；host 管道仍为进程内直连，不能当 Electron GUI/安全隔离/跨窗口/packaged 的证据。原生缓存旧提交与新写错位统一 RV-053（已修复，见 README 2026-10-05 清理记录）/RV-055（已修复，见 README 2026-10-05 清理记录），不归因 host 虚构结果。既有文件别名/备份意见和未完成矩阵保留。

本轮实际链路与取证限制 · 完整日志 · 提交/wire/队列观测。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。

## 2026-10-05：加密初始化取消联审

C2/C6 加密生命周期继续：原 adapter/core storage/client/host/临时文件真实执行，取消首次 unlock 后 locked=true 但 initialized=true；排队 B verifier_mismatch，正常已建 A 的凭据保护对照通过。**2 failed /1 passed**，统一 RV-058（已修复，见 README 2026-10-05 清理记录）。进程内 host 传输不是 Electron GUI/真实 IPC 或权限隔离；完整本包测试/发布 consumer 未由聚焦代验。

本轮源码/命令与未完成项 · 最终状态观测。encrypted/Electron/PGlite 严格 lint/typecheck 通过，业务未改；sqlite-core 没有伪造本轮独立 lint/整包通过。coverage 关闭，不自动核销 C 专题。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：strict lint、typecheck；当轮门禁限定。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                  | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| C1 renderer / host 边界   | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/electron-sqlite-host.ts:171-176 requireSession、257-290 parse/dispatch`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/main.ts:124-129 senderFrame`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts:94-104 denyForeignSession`<br>host先parse统一协议再dispatch，未知session返回session_closed；应用IPC验证主frame，再由窗口归属拒绝别人的session。库级host不自行知道Electron sender，权限必须应用bridge落实。                              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实IPC旧/未知session、跨窗口/子frame、畸形/巨大payload与未知操作，拒绝后无副作用；进程内host旧取证非GUI证据。       |
| C2 SQLite 多窗口与事务    | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/node-sqlite-engine.ts:251-277 open、295-310 execute、351-362 close、375-394 authorizer`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/electron-sqlite-host.ts:230-243 execute busy retry`<br>node:sqlite defensive+authorizer拒绝危险能力；多语句带bindings拒绝；close rollback/checkpoint并finally关DB。busy仅BEGIN重试且有预算，不按旧writer lease假设。                                                                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实同库双窗口/事务另一路写/关窗与host异常、重开；本轮未跑native/GUI、未测全部事务/崩溃矩阵。                        |
| C3 PGlite 独占与可选 peer | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts:113-152 acquirePgliteDirectoryLock`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-runtime.ts:129-165 suspendTransaction`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/package.json:76-86 optional peers`<br>PGlite用独立SQLite exclusive目录锁，不套SQLite多连接假设；事务begin有timeout并拒绝迟到句柄；optional peer声明单独入口。仅源码/包build不证明无peer的consumer。                                          | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控重复同目录打开、worker退出/崩溃锁释放、peer缺失只用SQLite的pack消费；本轮未跑实际worker/消费。                       |
| C4 文件与路径安全         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/electron-file-host.ts:225-259 resolveWithinRoot/canonicalize、356-366 containedPath、640-657 commitWrite`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts:51-59 resolver`<br>logical名与root词法/realpath双边界，允许根内symlink、拒绝越界；文件提交sync→close→rename→目录sync，异常清临时。没有执行旧desktop dist。                                                                                                                                                      | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实穿越/symlink/目录拒绝、锁冲突/同名、restore越界及并发失败；未对所有OS/filesystem认证，不延续历史RV-044为新发现。 |
| C5 加密与备份恢复         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-restore.ts:130-157 writeData/writeEntry、166-195 claimTarget/discardTarget`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts:133-147 restore marker`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts:131-188 restore/relaunch`<br>恢复校验写入长度/文件独占，目标reserved+目录锁，marker用于恢复失败状态；E2E源目录删除后新位置restore/relaunch能区别假备份。RV-058已修复，不用旧cancel失败重开。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控SQLite/PGlite两档、恢复中断/目标占用/失败重试、加密tamper/BigInt/binary与原库重开；未跑本轮真实宿主和覆盖率。        |
| C6 host 与应用集成        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/main.ts:151-177 contextIsolation/sandbox/navigation`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/preload.ts:108-135 narrow bridge`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/packaged-app.ts:80-96 resolveExecutable`<br>应用真实IPC通道只暴露request/subscribe且sandbox/contextIsolation开启，runner只找packaged可执行文件、缺失报错不浏览器替代。主控当前包build/typecheck不是packaged E2E。                                                                      | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控冷打包/Electron GUI、两后端重启持久化、多窗口/沙箱、生产依赖解析与consumer；平台不足保持未验证。                     |

证据：逐C矩阵、实际阅读、验证请求、待主控去重候选、历史验证分账。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
