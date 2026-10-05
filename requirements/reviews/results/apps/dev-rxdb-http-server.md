---
kind: review-execution
object: dev-rxdb-http-server
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# dev-rxdb-http-server：实际代码评审记录

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

真实 Nx serve＋隔离文件 PGlite 目录＋回环端口。正常查询 200、超限 body 413 两条路径通过；null/数组 metadata 及非法 request-target 各有实际请求证据。未执行全套端点测试、SSE/备份/分页并发或生产部署审查。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`apps/dev-rxdb-http-server/src/server.ts`](../../../../apps/dev-rxdb-http-server/src/server.ts)
- [`apps/dev-rxdb-http-server/src/http-utils.ts`](../../../../apps/dev-rxdb-http-server/src/http-utils.ts)
- [`apps/dev-rxdb-http-server/src/page-token.ts`](../../../../apps/dev-rxdb-http-server/src/page-token.ts)
- [`apps/dev-rxdb-http-server/src/recipes-repository.ts`](../../../../apps/dev-rxdb-http-server/src/recipes-repository.ts)
- [`apps/dev-rxdb-http-server/src/config.ts`](../../../../apps/dev-rxdb-http-server/src/config.ts)
- [`apps/dev-rxdb-http-server/src/control.ts`](../../../../apps/dev-rxdb-http-server/src/control.ts)
- [`apps/dev-rxdb-http-server/src/change-feed.ts`](../../../../apps/dev-rxdb-http-server/src/change-feed.ts)
- [`apps/dev-rxdb-http-server/src/change-subscribers.ts`](../../../../apps/dev-rxdb-http-server/src/change-subscribers.ts)
- [`apps/dev-rxdb-http-server/src/rxdb-store.ts`](../../../../apps/dev-rxdb-http-server/src/rxdb-store.ts)
- [`apps/dev-rxdb-http-server/src/main.ts`](../../../../apps/dev-rxdb-http-server/src/main.ts)

## 2. 评审意见

- RV-030：非法 HTTP 请求目标能让参考服务进程退出（已修复，见 README 2026-10-05 清理记录）
- RV-031：metadata 接口未验证 JSON 对象形状，null 返回 500、数组被接受（已修复，见 README 2026-10-05 清理记录）

## 3. 动态证据与复验

[HTTP 实际请求结果](../../evidence/2026-10-03/http-body-probes.json)

业务源码基线 `58b4bbb61efa71d4591cafab6a4c92955a7760dd`。SQL 复验明确关闭覆盖率；测试失败是预期的缺陷红灯，非 worker/service stopped 并发假失败。覆盖率未测量，也没有执行修复。

## 4. 尚未完成

- [ ] 原计划其余源码、C 项及真实运行环境补证。
- [ ] 针对确认问题先保持红测试，再最小修复、绿、重构。
- [ ] 适用的三框架/真实宿主及公开 API 兼容回归。
- [ ] 四项覆盖率、整包门禁与实际应用/E2E 链路。

原计划：[对应对象评审计划](../../apps/dev-rxdb-http-server.md)；进度：[全范围执行台账](../../execution-2026-10-03.md)。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

隔离 HTTP 演示服务端，承载 RuleGroup 查询、ETag、分页 token、SSE/变更流和本地数据存储。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-http-server/src/server.ts`](../../../../apps/dev-rxdb-http-server/src/server.ts)
- [`apps/dev-rxdb-http-server/src/recipes-repository.ts`](../../../../apps/dev-rxdb-http-server/src/recipes-repository.ts)
- [`apps/dev-rxdb-http-server/src/page-token.ts`](../../../../apps/dev-rxdb-http-server/src/page-token.ts)
- [`apps/dev-rxdb-http-server/src/change-feed.ts`](../../../../apps/dev-rxdb-http-server/src/change-feed.ts)
- [`apps/dev-rxdb-http-server/src/cors.ts`](../../../../apps/dev-rxdb-http-server/src/cors.ts)
- [`apps/dev-rxdb-http-server/src/rxdb-store.ts`](../../../../apps/dev-rxdb-http-server/src/rxdb-store.ts)
- [`apps/dev-rxdb-http-server/package.json`](../../../../apps/dev-rxdb-http-server/package.json)
- [`apps/dev-rxdb-http-server/project.json`](../../../../apps/dev-rxdb-http-server/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |

当前确认意见：RV-030（已修复，见 README 2026-10-05 清理记录）、RV-031（已修复，见 README 2026-10-05 清理记录）

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 请求与数据边界：从路由解析到 repository 审查请求 schema、方法、字段白名单、规则与 SQL 参数化。
- [ ] C2 鉴权、CORS 与控制接口：核查 demo control/seed/reset、origin/credentials、监听地址和部署假设，明确演示服务不等于生产安全模板。
- [ ] C3 ETag / token 完整性：检查 token 的作用域、过滤/排序绑定、有效期与条件请求缓存语义。
- [ ] C4 变更流与资源：审查 broadcaster/subscribers、重连 cursor、慢消费者和断开清理。
- [ ] C5 数据事务与进程生命周期：核查 rxdb-store、批写、seed/reset 的隔离、关库和错误映射。
- [ ] C6 client-server conformance：与 rxdb-adapter-http/reference server 和配套 E2E 逐请求对照；不能两边共用同一个错误假设。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

原四套端点/store/error/SSE **55 条均实际通过**；新增作为完整客户端后端的 12 例复验为 **5 failed /7 passed**。应用整套 **62 passed /5 failed /0 skipped**；五个红是上层 RV-052（已修复，见 README 2026-10-05 清理记录）/RV-053（已修复，见 README 2026-10-05 清理记录）/RV-054（已修复，见 README 2026-10-05 清理记录）/RV-055（已修复，见 README 2026-10-05 清理记录），不伪造服务本身新增四个根因。C2/C6 **部分执行**，鉴权仅 malformed Bearer 的既有 401，不验收真实身份认证/浏览器 CORS；新测试客户端 default memo 与 Recipe 示例 0ms 明确区分。增加五个 workspace devDeps、app/spec references 是测试基础设施，业务源码未改。

[本轮实际链路与取证限制](../../execution-2026-10-04-sync-http-sqlite.md) · [完整日志](../../evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [提交/wire/队列观测](../../evidence/2026-10-04/sync-http-sqlite/final-observations.json)。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../../evidence/2026-10-05/parallel/integrations/current-gates.json)。

**晚于门禁快照新增的探针**：`src/__tests__/review-parallel-change-broadcast-origin.spec.ts` 未运行，也未继承上述lint/typecheck；已列验证请求交主控分流。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                     | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 请求与数据边界            | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/http-utils.ts:34-52 readJsonBody`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:324-338 URL错误、400-409 decodeSegments`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/recipes-repository.ts:330-373 readObject/readIdList/readWritablePatch`<br>body限制1MiB、对象形状/IDs/可写字段显式检查；非法URL与percent escape返回400，不让异步handler裸崩。规则深度检查后交上游查询编译，未另造fallback。         | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮server:test运行结果由主控后补；需空body/数组/null、畸形target、未知field/RuleGroup注入、巨大body与错误数字，拒绝后数据库不变。         |
| C2 鉴权、CORS 与控制接口     | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:94-100 assertAuthorized、370-380 dispatch、411-434 runControl`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/cors.ts:52-95 origin/preflight`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/main.ts:49 runServe`<br>这是loopback demo：无Authorization放行，有header只验Bearer形状；控制接口在NODE_ENV非production开启且在offline闸门之前；origin回显、OPTIONS在鉴权前。不是生产Auth/CORS拒绝实现。        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 补production控制接口404、错误Bearer/no-body副作用及可信测试origin对照；未授权origin/真实身份拒绝需要受控生产式server，不可用demo成功核销。 |
| C3 ETag / token 完整性       | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:117-147 sendConditional/handleMetadata`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/http-utils.ts:63 computeEtag、94-98 matchesIfNoneMatch`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/page-token.ts:54-97 encode/decodePageToken`<br>ETag由完整响应JSON的SHA256生成；支持weak/list/*匹配。token校验非空string及a/w tuple结构，载荷base64url并非MAC或filter身份绑定。对token完整性不给越权安全结论。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实条件请求、内容更新后200、篡改token/旧filter/同值排序/分页删除；只有合法静态250行翻页对照，不能覆盖全部恶意token。                  |
| C4 变更流与资源              | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/change-feed.ts:34-57 openChangeFeed`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/change-subscribers.ts:29-54 createChangeSubscribers`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/change-broadcaster.ts:47-74 recordWrite/onEntityEvent`<br>SSE response close删订阅、request close清心跳，closeAll收束。广播按实体事件派发，但合批归最后clientId为静态候选A；并非本轮已复现缺陷。                              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控新增review-parallel-change-broadcast-origin.spec.ts与真实PGlite/双client SSE时序；断线、慢消费者、结束后订阅/timer归零仍需动态。       |
| C5 数据事务与进程生命周期    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/rxdb-store.ts:51-73 createRxdbRecipeStore`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:253-282 reseed/close`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/main.ts:53-57 信号清理`<br>数据层使用真实RxDB/PGlite文件而非旧node:sqlite demo；reset先destroy再换库，body await后现取store避免已释放句柄；停机先关SSE再server/store。                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控test中验证并发reset/请求、提交失败、信号退出、重开持久化与clear/reset不同语义；本轮没有启动进程，不判进程收束通过。                    |
| C6 client-server conformance | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:170-230 routeProtocol`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/recipes-repository.ts:111-125 listMetadataByOffset、308-320 deleteRecipes`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/playwright.config.ts:61-75 双服务`<br>逐项对照metadata/by-ids/create/update/delete和变更流；应用server与客户端协议路径可追溯，E2E依赖冷前端build及后端build-deps而非旧产物。                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮server整包、HTTP adapter wire、本轮E2E由主控后补；协议fixture/mock不能代替真实应用server的响应与数据库状态。                           |

证据：[逐C矩阵](../../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
