---
kind: review-execution
created: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
execution: partial
---

# 2026-10-04 第五批：Sync 与 QueryCache 深度评审

本批实际执行两个包的恢复编排、共享查询、读写竞争和水位保护，新增 **3 个 P2 确认意见**。不是补写计划，也不是修复完成。70 对象的全仓范围保持不变，仍为 **0 个全对象深审完成**；本批没有新增 C 项完全核销。

## 1. 确认意见

| 意见                                            | 已复现行为                                                         | 负向 / 正常对照    |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------------ |
| RV-052（已修复，见 README 2026-10-05 清理记录） | 自动恢复忽略真实 flush 的 failures，403/网络失败后仍清错并宣布成功 | 2 failed /1 passed |
| RV-053（已修复，见 README 2026-10-05 清理记录） | 迟到旧 pull 覆盖已确认 update，或复活已确认删除的缓存行            | 2 failed /1 passed |
| RV-054（已修复，见 README 2026-10-05 清理记录） | 同指纹两个 SWR 消费者共享失败回源，第二个仍写入“已校验”memo        | 1 failed /2 passed |

全部 Open。业务源码未改，原有 646 个通过用例仍通过，新增失败断言保留；不能为了门禁全绿删除/skip 它们。

## 2. 按包实际核查

### rxdb-plugin-sync

[独立执行记录](results/packages/rxdb-plugin-sync.md) / [专项计划](packages/rxdb-plugin-sync.md)。

- C1/C5：追踪 `setupSyncListeners → ready/wakeup → exhaustMap → resumeSync → flushRepositories → 原 flushQueryCacheOutbox → SyncStateHub`。单仓库在飞去重、结构化失败与上层 Promise 的差异实际复验。确认 RV-052；没有把 outbox 正确保留的写误报为已经丢失。
- C2：阅读 outbox 的 compact/group、metadata probe、DELETE→INSERT/UPDATE phases、LWW disposition、partial watermark 和 repair 路径；完整 push/pull 的全部重试/乱序/丢响应矩阵未完成。
- C3：阅读 dependency graph、cycle detection、action direction、topological sort 和 cascade blocker。循环检测与 DELETE 相反顺序已有实现，不报“没有环保护”的猜测；缺父实体、跨批关联/并行竞争仍需真实后端补证。
- C4：阅读冻结 scope/lineage/filter/cutoff、页 resume 和 intent drift/settle 接口；没有把“函数里有事务 executor”当作所有 CAS/崩溃原子性已证明。
- C6：`cleanupExpired` 在非 dryRun 模式将候选读取、未推写保护和 trusted merge 放在同一 transaction 内。未推保护包含 remoteId/revertChangeId 条件，不报“无条件删离线写”；跨分支/水位保留及竞态尚未核销。

### rxdb-plugin-querycache

[独立执行记录](results/packages/rxdb-plugin-querycache.md) / [专项计划](packages/rxdb-plugin-querycache.md)。

- C1/C2：追踪 fingerprint→在飞共享→SWR/网络 fallback→primary 独立 callback→memo remember。确认 RV-054；区分契约允许的缓存先发与错误的校验记忆。
- C3：经真实公开 Repository 的 update/remove 复验读快照先发生、写确认在中间、旧响应最后交付的顺序。确认 RV-053；服务器状态保持正确，只报告实际观测到的本地投影回滚。
- C4：工厂每 session 独立 memo、bindAdapters identity/generation、scoped 注册撤销入口已读；新 fixture 都 destroy 真实 RxDB，不能据此验收生产连接切换/关闭中请求的所有时序。
- C5：能力 duck 检查与远端 write verb 缺失拒绝已读；实验性直接引擎与稳定公开 Repository 的边界已区分。真实 HTTP/Supabase 服务、Tree/Graph 支持限制和发布 consumer 未全量复验。

## 3. 实際执行与证据

Node **v26.7.0** / pnpm **10.34.6** / Vitest **4.1.11**，实际 Playwright Chromium browser project。resolved targets：[Sync](evidence/2026-10-04/sync-querycache/sync-project.json) / [QueryCache](evidence/2026-10-04/sync-querycache/querycache-project.json)。

| 测量                                    | 实際结果                                                            | 证据                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新用例之前两个包原测试基线              | Sync 449 passed；QueryCache 197 passed；均无 skip                   | [任务日志](evidence/2026-10-04/sync-querycache/baseline.txt)、[计数](evidence/2026-10-04/sync-querycache/baseline-counts.json)、[Sync JUnit](evidence/2026-10-04/sync-querycache/rxdb-plugin-sync-baseline-junit.xml)、[QueryCache JUnit](evidence/2026-10-04/sync-querycache/rxdb-plugin-querycache-baseline-junit.xml) |
| QueryCache 三种负向时序＋三个对照       | 3 failed /3 passed                                                  | [聚焦日志](evidence/2026-10-04/sync-querycache/querycache-probes-repaired.txt)                                                                                                                                                                                                                                           |
| Sync 两种实际返回失败＋成功对照         | 2 failed /1 passed                                                  | [聚焦先行日志](evidence/2026-10-04/sync-querycache/sync-resume-outbox-initial.txt)                                                                                                                                                                                                                                       |
| 最终两个整包测试（包含新红）            | Sync 450 passed /2 failed；QueryCache 200 passed /3 failed；无 skip | [完整静态输出](evidence/2026-10-04/sync-querycache/final-all-tests.txt)、[逐例汇总](evidence/2026-10-04/sync-querycache/final-counts.json)                                                                                                                                                                               |
| 两项目严格 lint                         | 通过，`--max-warnings=0`                                            | [日志](evidence/2026-10-04/sync-querycache/final-lint.txt)                                                                                                                                                                                                                                                               |
| 两项目 typecheck 与依赖 build/typecheck | 通过                                                                | [日志](evidence/2026-10-04/sync-querycache/final-typecheck.txt)、[退出码](evidence/2026-10-04/sync-querycache/final-task-status.json)                                                                                                                                                                                    |

已逐个比较基线与最终 JUnit 的 classname/name，确认原 646 条全部保留且仍通过：[逐例保留校验](evidence/2026-10-04/sync-querycache/original-case-retention.json)。

本轮所有动态结论均禁本地/远端 Nx 缓存，测试串行且 maxWorkers=1。基线和最终整包均实际重建依赖；聚焦测试仅在前置依赖刚构建且生产源指纹未变的情况下跳过依赖任务。**coverage 关闭，未验收四指标门禁**。先行基线使用 CI 折叠输出，补存当时 JUnit 后才加入新用例，未用最终报告倒推旧基线。

测试接缝：两侧适配器/存储是内存假件，远端响应用 Observable/Subject 固定先后，Reachability 脱离真实网卡。真实执行的 RxDB/Repository/QueryManager/工厂/primary/读引擎或 outbox/监听器/状态 hub 与接缝逐报告分开；本轮**不宣称真实 SQLite、HTTP、Supabase 或三框架应用链路全绿**。

## 4. 取证自身错误与排除项

1. QueryCache 初次 helper 未提供 adapter.disconnect，finally 的真实 RxDB.destroy 报 TypeError，掩盖了原断言；已补齐测试 adapter 生命周期，再复验得到 3 failed /3 passed。[初次日志](evidence/2026-10-04/sync-querycache/querycache-probes-initial.txt) 保留，不登记为产品缺陷。
2. 新 helper 的 late-assigned rxdb 触发 prefer-const，已改 const；新 Sync fixture 的完整 RxDBChange 断言缺 branch$、SyncOptions 字面量扩大造成两个 TS 错误，已改受检查的 Partial fixture /明确联合类型。[初次 lint](evidence/2026-10-04/sync-querycache/lint-initial.txt)、[初次 typecheck](evidence/2026-10-04/sync-querycache/typecheck-initial.txt) 保留。这些是取证代码的问题，不归因并发或既有业务。Nx “flaky” 标签不替代具体 TS 诊断。
3. 几次先行 shell 包装器在任务结束后误用 zsh 的只读 `status` 捕获退出码；任务结果按原始 Nx 日志/JUnit 记录，不将包装器错误计为产品或 ESLint 失败。最终 lint 使用 `rc` 重跑并保存真实退出码；最终 typecheck/test 的独立退出码已经正常保存。
4. 没有把有正确水位保护的返回失败误报为数据丢失；没有把 SWR 有缓存时先发缓存/暂时吞远端失败的既有契约本身列为缺陷；没有把源码里已存在的环保护/transaction 漏看成“无实现”。
5. 不 reset/stash/改暂存区、不 commit，不改用户正在处理的依赖/Cargo/benchmark 内容。新增仅为三个复验 spec、一个 fixture 和评审文档/证据。

## 5. 尚未完成与继续顺序

1. QueryCache 写开始/结算/缓存提交屏障、离线 pending 快照后写入、adapter 切换与 scope 销毁；真实 SQLite + HTTP 网络调度复验。
2. Sync outbox partial watermark、repair 与新离线写竞争、branch 切换、多仓库恢复；实际 push/pull 丢响应/幂等协议。
3. 分支物化分页续传、CAS 落败、崩溃恢复和清理保护的真实后端矩阵；不以单元基线代替。
4. 覆盖率四项、外部 Supabase 服务和 Angular/React/Vue 用户链路分别取证；不启动有已知共享容器风险的默认 test-env。

[当轮任务汇总](evidence/2026-10-04/sync-querycache/round-results.json) · [源码与版本指纹](evidence/2026-10-04/sync-querycache/runtime-and-sources.json) 保留 42 个本轮初始生产源/配置摘要与最终复验源摘要；已核对初始生产源/配置没有变化。原日志使用可跟踪 `.txt`，继承日期目录的 `-text -diff` 属性；最终文档链接、摘要和格式复核见 [交付校验](evidence/2026-10-04/sync-querycache/delivery-validation.json)。

## 续评索引：2026-10-04 第六批

[真实 HTTP /文件 SQLite 联审](execution-2026-10-04-sync-http-sqlite.md)：新增 RV-055（P2），RV-052/053/054 补后端实测并限定适用范围，更新六对象。原应用 55 条过、新复验 5 failed /7 passed；没有重写本文件历史测量，没有新增完整 C 核销，全对象深审仍 0 个完成。
