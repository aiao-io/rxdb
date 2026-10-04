---
kind: review-execution
created: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
execution: partial
---

# 2026-10-04 第六批：Sync /QueryCache 的真实 HTTP 与文件 SQLite 联审

本批补前轮的真实后端证据，新增 **RV-055（已修复，见 README 2026-10-05 清理记录）（P2）**，并实测补证 RV-052/053/054。更新 5 个包及 1 个应用记录。没有修改业务实现，没有新增完整 C 专项核销；全仓 70 对象仍为 **0 个全对象深审完成**。

## 1. 真实测量面

链路是 **原 RxDB/公开 Repository → 原三插件 → 原 HTTP adapter/native fetch → 回环延迟代理 → 原参考应用路由/Repository → 实际 PGlite 文件目录**。客户端缓存为 **原 SQLite adapter/client/host → node:sqlite 临时文件**，另开原生只读连接验证提交结果，不拿内存 Map 代替存储。

接缝只有：进程内 host 管道替代 Electron IPC；代理推迟原后端已经生成的响应；Reachability 输入控制离线写；非法 Bearer 触发原鉴权的 401；upsert 观测器始终调用原实现。所有端口由内核分配、数据库在本轮独立临时目录中，结束关闭/删除。

**不是 Electron GUI、浏览器 CORS/OPFS、Supabase、三框架 UI 或 npm pack 消费测试。** Vitest 的 app 配置走源码 tsconfig paths；虽然依赖实际构建，不能把源码集成冒充发布产物消费。

## 2. 结论与必要的收窄

| 意见                                            | 实际结果                                                                                             | 结论边界                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RV-052（已修复，见 README 2026-10-05 清理记录） | 实际服务 metadata probe 401，待推=1，却 lastError=null、reportSuccess 被调用；成功对照过             | 1 failed /1 passed。401 在 metadata probe，不冒充 REST write 的 403 实测                             |
| RV-053（已修复，见 README 2026-10-05 清理记录） | 原生 SQLite 记录旧提交；在线新查询可收敛，origin 停止后离线读取稳定返回被覆盖的新值/复活行           | 2 failed /3 passed。**不再外推“在线最终必然保持旧值”**；保留真实网络中断下用户可见错误               |
| RV-054（已修复，见 README 2026-10-05 清理记录） | 两个分页共享实际 401 后，下一分页 500ms 内仍只有一次 metadata 请求；单消费者失败/共享成功对照过      | 1 failed /2 passed。客户端为默认 1000ms memo；现有 Recipe 示例 syncStaleTime=0，不宣称示例页面也触发 |
| RV-055（已修复，见 README 2026-10-05 清理记录） | A 被远端 R 赢后等待 repair，B 写入产生新待推；旧 repair 覆盖 B，SQLite/公开查询均为 R，队列 B 仍保留 | 1 failed /1 passed。只报告投影回滚，不报告 B 变更日志被删除/错误确认                                 |

RV-053 初始真实在线测试在不同调度下分别观察到已修复或尚未修复的即时值，不能选一次日志概括所有生产最终状态。本批保留旧日志，并将在线对照明确为“原读取后新查询重新收敛”；origin-down 复验则从原始已确认状态到旧 SQLite/离线结果的完整顺序取证。

## 3. 实际执行

Node v26.7.0 /pnpm 10.34.6 /Vitest 4.1.11；Node 环境，测试串行/maxWorkers=1，coverage 关闭。本轮全部动态结论禁本地/远端 Nx 缓存。

| 任务                                 | 结果                                    | 证据                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新测试前原应用基线                   | 4 files /55 passed                      | [日志](evidence/2026-10-04/sync-http-sqlite/app-server-baseline.txt)、[命令/退出码](evidence/2026-10-04/sync-http-sqlite/app-server-baseline-status.json)                                                    |
| 最终应用全套，含 4 个新 spec         | 8 files；62 passed /5 failed /0 skipped | [完整日志](evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt)、[JUnit](evidence/2026-10-04/sync-http-sqlite/final-app-junit.xml)、[计数](evidence/2026-10-04/sync-http-sqlite/final-counts.json) |
| 新增复验                             | 12 tests；5 failed /7 passed            | 同上，原 55 条全部仍通过                                                                                                                                                                                     |
| 六对象严格 lint                      | 通过，`--max-warnings=0`                | [日志](evidence/2026-10-04/sync-http-sqlite/final-six-project-lint.txt)、[退出码](evidence/2026-10-04/sync-http-sqlite/final-six-project-lint-status.json)                                                   |
| 新 app/fixture/spec 的最终 typecheck | 通过                                    | [日志](evidence/2026-10-04/sync-http-sqlite/final-current-app-typecheck.txt)、[退出码](evidence/2026-10-04/sync-http-sqlite/final-current-app-typecheck-status.json)                                         |

基线和首轮集成实际跑依赖 build；首次 typecheck 跑 30 个依赖任务，其后 app 取证 TS 问题修正，再单独真实 typecheck。聚焦/最终 app 测试跳过依赖任务仅发生在产物已实际构建且生产源未变的前提下。覆盖率、完整各包测试和发布门禁本轮未核销；前轮各包红测试未删除，不用本应用结果掩盖。

[最终 wire/提交/队列观测](evidence/2026-10-04/sync-http-sqlite/final-observations.json) · [当轮任务汇总](evidence/2026-10-04/sync-http-sqlite/round-results.json) · [版本与源码指纹](evidence/2026-10-04/sync-http-sqlite/runtime-and-sources.json)。已核对 **152 个生产源字节不变**。

## 4. 测试基础设施变化与取证错误

- 按 workspace skill 用 pnpm 为 app 添加五个 **devDependencies: workspace:\***，不手工伪造链接、不加 tsconfig paths。`nx sync` 实际更新 app references；spec references 另外明确对齐这五个依赖：[链接范围](evidence/2026-10-04/sync-http-sqlite/workspace-link-scope.json)、[sync 日志](evidence/2026-10-04/sync-http-sqlite/nx-sync.txt)。没有新增项目/target，本轮目标图没有报循环依赖。
- pnpm 顺带重新计算了无关 website/peer snapshots。保留 pnpm 生成的本 app importer，恢复**本轮前工作区**其余 lock 字节；最终只有 app importer 改变，package/snapshot 键与内容未变，用户原依赖升级保留。[原 pnpm diff](evidence/2026-10-04/sync-http-sqlite/pnpm-link-lock-diff.txt) 单独留存，不将其算作评审所需变更。没有 reset/stash 或操作暂存区。
- 首次把 Electron adapter 注册为 `electron` 而非实际 `sqlite-electron`，七例未进入产品断言：[初次日志](evidence/2026-10-04/sync-http-sqlite/first-real-backend-probes.txt)。已改 fixture，不登记为 adapter bug。
- 第二轮 pending fixture 以原始字符串等值查实体 id，没有使用系统 changelog 的规范化查询值，拿不到 A；已用上游 `getRxDBChangeEntityIdQueryValues`：[第二轮日志](evidence/2026-10-04/sync-http-sqlite/second-real-backend-probes.txt)。最终真实时间戳明确 A<R<B，没有使用假 Date。
- 首次新依赖 typecheck 缺 spec references，另有 auth hook 的联合返回类型不符合 string header map，已补正确引用与类型：[初次类型日志](evidence/2026-10-04/sync-http-sqlite/initial-linked-typecheck.txt)。不把这些取证错误当成业务问题或并发 flaky。
- 首次 SWR 正常对照在新请求尚未到达服务端时就计数，已改为等待真实 wire 请求，负向窗口 500ms 小于默认 memo 1000ms：[初次 SWR](evidence/2026-10-04/sync-http-sqlite/swr-real-http-probe.txt)、[修正后](evidence/2026-10-04/sync-http-sqlite/repaired-swr-real-http.txt)。不以该早期对照假失败新增意见。

早期 setupConflict 取证异常在返回前发生，留下四个仅测试用临时目录；已用 lsof 确认没有活句柄，再按精确已知路径清理。修正版 setup 有统一 close：[清理记录](evidence/2026-10-04/sync-http-sqlite/temp-cleanup.json)。未删用户文件。

## 5. 按对象与尚未完成

- [Sync](results/packages/rxdb-plugin-sync.md)：C1/C5 原失败契约补真实 wire；新 RV-055 需要提交边界保护。restore/drop、多实体、branch 切换、修复失败/重试、完整 push/pull 幂等继续。
- [QueryCache](results/packages/rxdb-plugin-querycache.md)：C1/C2/C3 实际缓存/错误/新写补证；C4 lifecycle、C5 能力/发布 consumer 与真实 Supabase 仍未全部取证。
- [HTTP adapter](results/packages/rxdb-adapter-http.md)：C1/C4/C5 线契约、写/outbox、迟到/网络断开联审；ETag/分页/SSE/浏览器 CORS 和发布档位未由本轮代验。
- [sqlite-core](results/packages/rxdb-adapter-sqlite-core.md)：C2 原触发器/缓存裸写/事件实际运行，SQLite COMMIT 后有旧投影不是假 SQL；完整事务/迁移/其它后端矩阵未完成。
- [Electron adapter](results/packages/rxdb-adapter-electron.md)：实际 host/client/SQLite 文件与另一只 native 连接；不验收 GUI、跨窗口/进程、安全隔离与 packaged 生命周期。
- [参考应用](results/apps/dev-rxdb-http-server.md)：原四套 55 条端点/store/error/SSE 用例真实通过，新增作为消费者的后端集成。生产部署/鉴权替换/任意不可信请求、各 UI E2E 与全部 C 项仍未完成。

[交付校验](evidence/2026-10-04/sync-http-sqlite/delivery-validation.json) 将链接、源码摘要、原始证据可跟踪性、格式和显式范围 diff 检查分开记录；不以文档完整代替代码/平台评审完成。

## 续评索引：2026-10-04 第七批

[编辑器与三框架文件预览](execution-2026-10-04-editor-frameworks.md)：新增 RV-056/057（两个 P2），更新七对象；真实框架/CodeMirror/Blob 配合明确时序接缝，不冒充浏览器/OPFS。完整 C 和全对象完成度未批量标绿，本文件历史测量保留。
