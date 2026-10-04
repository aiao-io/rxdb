---
kind: review-execution
object: rxdb-plugin-querycache
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-querycache：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

SyncType.QueryCache 查询缓存引擎、远端主适配器和离线写语义。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts`](../../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts)
- [`packages/rxdb-plugin-querycache/src/query-cache-primary.ts`](../../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts)
- [`packages/rxdb-plugin-querycache/src/query-cache-sync-memo.ts`](../../../../packages/rxdb-plugin-querycache/src/query-cache-sync-memo.ts)
- [`packages/rxdb-plugin-querycache/src/query-cache-engine.factory.ts`](../../../../packages/rxdb-plugin-querycache/src/query-cache-engine.factory.ts)
- [`packages/rxdb-plugin-querycache/src/plugin.ts`](../../../../packages/rxdb-plugin-querycache/src/plugin.ts)
- [`packages/rxdb-plugin-querycache/package.json`](../../../../packages/rxdb-plugin-querycache/package.json)
- [`packages/rxdb-plugin-querycache/project.json`](../../../../packages/rxdb-plugin-querycache/project.json)
- [`packages/rxdb-plugin-querycache/src/index.ts`](../../../../packages/rxdb-plugin-querycache/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

全范围启动批当时尚无新增确认问题；不表示下述续评无问题，也不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 缓存身份与质量：核查查询键、entity/scope/branch 身份、缓存有效性和已缓存/完整结果的区别。
- [ ] C2 离线读取与错误：追踪本地/远端 adapter 选择、网络状态和错误分类；仅允许契约明确的离线缓存行为。
- [ ] C3 离线写入与 outbox：核查 primary adapter、entity manager 与 sync memo/outbox 对本地写、确认与失败的衔接。
- [ ] C4 插件 scope 与生命周期：审查 engine factory、inject、销毁与 reconnect，多库不能共享错误 memo。
- [ ] C5 公开能力收窄：对照现有 API baseline 与 Tree/Graph/主适配器的限制，不为满足评审给出隐式支持。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：共享查询与读写竞争深审

基线 `8b29b549ac5758b2e31a6148b98b8c394754e918`，详见 [本批台账](../../execution-2026-10-04-sync-querycache.md)。当前仍为**部分执行**，不作全包完成评级。

确认两条 P2：RV-053：迟到旧 pull 回滚已确认写（已修复，见 README 2026-10-05 清理记录）、RV-054：共享 SWR 失败被记成已校验（已修复，见 README 2026-10-05 清理记录）。跨包状态问题另见 RV-052（已修复，见 README 2026-10-05 清理记录），不复制为第四条缺陷。

| 专项                     | 本轮结论与证据                                                                        | 剩余边界                                                        |
| ------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| C1 缓存身份与质量        | **部分执行，确认 RV-054**；同 where 不同分页共享同步，但结算状态没共享                | 多库/scope/branch、分页完整性与全模式 invalidation              |
| C2 离线读取与错误        | **部分执行，确认 RV-053/054**；读取代次、SWR、网络 fallback 和 memo 结算已追踪        | 无缓存/超时/更多错误与真实服务行为；不取消既有 SWR 契约         |
| C3 离线写入与 outbox     | **部分执行，确认 RV-053**；公开仓储 update/remove 在旧读响应迟到时回滚本地投影        | pending 快照后写、重开、丢响应、删除重建；RV-052 的应用状态链路 |
| C4 插件 scope 与生命周期 | **部分执行**；独立 session memo、adapter identity/generation、scoped 注册撤销入口已读 | 连接切换、关闭中请求、同实体多库的完整生命周期矩阵              |
| C5 公开能力收窄          | **部分执行**；duck/verb 拒绝与稳定 Repository/实验性直接引擎边界已核对                | 真实 HTTP/Supabase、Tree/Graph 限制、发布 consumer              |

原基线 **197 passed、无 skip**；新增用例 **3 failed /3 passed**；最终整包 **200 passed /3 failed、无 skip**：[完整日志](../../evidence/2026-10-04/sync-querycache/final-all-tests.txt) / [JUnit](../../evidence/2026-10-04/sync-querycache/rxdb-plugin-querycache-final-junit.xml)。原 197 条仍通过。严格 lint /typecheck 通过，coverage 关闭，没有核销完整 C 专项。

三个失败经实际 RxDB/EntityManager/Repository/QueryManager/插件工厂/primary/引擎执行；[helper](../../../../packages/rxdb-plugin-querycache/src/__tests__/fixtures/review-querycache-harness.ts) 的存储/远端交付仍是接缝，不能称真实 SQLite 或 HTTP/Supabase 网络实测。每例 destroy 真实 RxDB，初始缺 disconnect 的取证错误已修正并单列日志。业务实现未改，两条仍 Open。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

RV-053（已修复，见 README 2026-10-05 清理记录） 实测需要限定：在线新查询可收敛，origin 停止后的旧响应落地使离线读返回旧值/复活行；RV-054（已修复，见 README 2026-10-05 清理记录） 已补真实 HTTP 401→原共享回调→memo。出站新写保护另见 RV-055（已修复，见 README 2026-10-05 清理记录），不重复登记。C1/C2/C3 **部分执行**；默认 1000ms 是测试客户端配置，Recipe 示例的 0ms 不受 RV-054 影响。scope/发布消费/Supabase 仍待补证。

[本轮实际链路与取证限制](../../execution-2026-10-04-sync-http-sqlite.md) · [完整日志](../../evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [提交/wire/队列观测](../../evidence/2026-10-04/sync-http-sqlite/final-observations.json)。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。
