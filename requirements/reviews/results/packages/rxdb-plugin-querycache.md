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

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

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
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

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

基线 `8b29b549ac5758b2e31a6148b98b8c394754e918`，详见 本批台账。当前仍为**部分执行**，不作全包完成评级。

确认两条 P2：RV-053：迟到旧 pull 回滚已确认写（已修复，见 README 2026-10-05 清理记录）、RV-054：共享 SWR 失败被记成已校验（已修复，见 README 2026-10-05 清理记录）。跨包状态问题另见 RV-052（已修复，见 README 2026-10-05 清理记录），不复制为第四条缺陷。

| 专项                     | 本轮结论与证据                                                                        | 剩余边界                                                        |
| ------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| C1 缓存身份与质量        | **部分执行，确认 RV-054**；同 where 不同分页共享同步，但结算状态没共享                | 多库/scope/branch、分页完整性与全模式 invalidation              |
| C2 离线读取与错误        | **部分执行，确认 RV-053/054**；读取代次、SWR、网络 fallback 和 memo 结算已追踪        | 无缓存/超时/更多错误与真实服务行为；不取消既有 SWR 契约         |
| C3 离线写入与 outbox     | **部分执行，确认 RV-053**；公开仓储 update/remove 在旧读响应迟到时回滚本地投影        | pending 快照后写、重开、丢响应、删除重建；RV-052 的应用状态链路 |
| C4 插件 scope 与生命周期 | **部分执行**；独立 session memo、adapter identity/generation、scoped 注册撤销入口已读 | 连接切换、关闭中请求、同实体多库的完整生命周期矩阵              |
| C5 公开能力收窄          | **部分执行**；duck/verb 拒绝与稳定 Repository/实验性直接引擎边界已核对                | 真实 HTTP/Supabase、Tree/Graph 限制、发布 consumer              |

原基线 **197 passed、无 skip**；新增用例 **3 failed /3 passed**；最终整包 **200 passed /3 failed、无 skip**：完整日志 / JUnit。原 197 条仍通过。严格 lint /typecheck 通过，coverage 关闭，没有核销完整 C 专项。

三个失败经实际 RxDB/EntityManager/Repository/QueryManager/插件工厂/primary/引擎执行；[helper](../../../../packages/rxdb-plugin-querycache/src/__tests__/fixtures/review-querycache-harness.ts) 的存储/远端交付仍是接缝，不能称真实 SQLite 或 HTTP/Supabase 网络实测。每例 destroy 真实 RxDB，初始缺 disconnect 的取证错误已修正并单列日志。业务实现未改，两条仍 Open。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

RV-053（已修复，见 README 2026-10-05 清理记录） 实测需要限定：在线新查询可收敛，origin 停止后的旧响应落地使离线读返回旧值/复活行；RV-054（已修复，见 README 2026-10-05 清理记录） 已补真实 HTTP 401→原共享回调→memo。出站新写保护另见 RV-055（已修复，见 README 2026-10-05 清理记录），不重复登记。C1/C2/C3 **部分执行**；默认 1000ms 是测试客户端配置，Recipe 示例的 0ms 不受 RV-054 影响。scope/发布消费/Supabase 仍待补证。

本轮实际链路与取证限制 · 完整日志 · 提交/wire/队列观测。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 原 engine/session/primary 与公开 EntityManager.findAll 路径，确认关系条件和 namespace 冷缓存两个接缝。历史 Sync/HTTP 测量不重写。

确认意见：RV-060、RV-061。全批门禁、接缝和中间取证错误见 本轮执行台账；源码指纹、最终计数 与 交付校验。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**203 passed /0 failed /0 skip**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-querycache` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**97.46% / 88% / 99.09% / 97.57%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-querycache/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                                            | 不变量、正向与反证                                                                                                                                                                                                   | 已有/本轮测试证据                                                                                      | 必要缺口或核销边界                                                                                                                                     |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | partial / 待证 | query-cache-sync-memo.ts:52–57、101–151；QueryCacheEngine.ts:242–299、658–818；query-cache-primary.ts:162–173               | fingerprint 含 where/SWR/fallback 语义，分页在同步后交本地 repo；会话 memo 不跨 Repository 共享。pending id 在 reconcile 中保留，不能把 where 局部同步当全库完整缓存。                                               | memo/engine/primary 及既有 review 回归入口；当前 203/203 通过。RV-061 为现有联审问题，不重复登记。     | 同过滤多库/scope/branch、分页完整性及 namespace 冷缓存 production-path 仍缺全面对照；RV-061 接缝由其它组供证。                                         |
| C2  | partial / 待证 | QueryCacheEngine.ts:521–562、627–640；query-cache-primary.ts:319–337、379–397                                               | offlineFallback 只吞 network 错误；无缓存会 reject。SWR 已发本地缓存后允许远端错误由 onRemoteError 可见而保持既有结果，此语义不能擅自改成所有错误都 reject。共享 error-handler 集合负责回传。                        | 既有 SWR/离线/共享回调复验；当前 203/203 通过。RV-060 关系条件由联审组负责。                           | 真实鉴权/语法/超时、旧响应、合法关系查询及 RLS 等生产错误分类未全面闭合；RV-060 未解决前不宣称全专题通过。                                             |
| C3  | partial / 待证 | query-cache-primary.ts:199–249、293–336；QueryCacheEngine.ts:116–125、785–818；sync/query-cache-outbox.ts:903–928           | create/update/remove 对称清 memo+递增读代次，旧 pull 的写投影被 generation 拦截；离线写先真实本地成功后报告队列；outbox repair 再查 maxChangeId 后的新写以免覆盖。原 RV-053/055 相关路径按当前源确认，不复刻旧观点。 | review-querycache-harness 驱动的既有读写竞争回归与 outbox 套件；当前 querycache 203、sync 452 均通过。 | 响应丢失后投递幂等、多实体 repair/删除重建、进程重开和真实远端冲突拒绝未全覆盖；代次 guard 不能证明所有写入窗口均原子。                                |
| C4  | partial / 待证 | query-cache-engine.factory.ts:31–59；plugin.ts:27–30；query-cache-sync-memo.ts:101–151；上游 Repository.ts:220–227、566–574 | 工厂按 context 创建独立 session，adapter pair 变化清 memo 并推进纪元；clear 清 timer；远端 invalidation 同时清 memo/引擎代次。destroy 只见 session.clear，不能据此假设所有已订阅 SWR 被取消。                        | 工厂/adapter binding/memo 清理与公开 Repository 既有回归；当前 Node 全套通过。                         | 关闭中远端响应、同实体多库、热切 scope/reconnect 的全部资源所有权与晚响应路径仍缺 production-path 复验；这里只记录缺口，不凭静态缺少取消直接登记缺陷。 |
| C5  | partial / 待证 | query-cache-primary.ts:97–105、319–322、428–451；plugin.ts:27–30；联审 RV-060/061                                           | 读 duck 与每个远端写 verb 分别显式拒绝；正常主仓储和直接 QueryCacheEngine 的实验性边界分开。Tree 禁 QueryCache 的上游 registry 已对照，不增隐式 fallback。                                                           | 能力拒绝/entry-type 套件和当前 203/203 通过；主控 lib typecheck 通过。                                 | 真实 HTTP/Supabase 的不支持组合、认证与发布 consumer 尚缺全矩阵，RV-060/061 不由本组重复立项。                                                         |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
