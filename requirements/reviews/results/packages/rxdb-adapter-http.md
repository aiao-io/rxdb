---
kind: review-execution
object: rxdb-adapter-http
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# rxdb-adapter-http：实际代码评审记录

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

仅完成上述模块的部分静态阅读。已核对“切换用户需 disconnect/connect”和“只有首个同身份查询的观测回调生效”等已明确文档化限制，未将其误报为新缺陷。没有执行该包完整网络/取消/SSE/缓存/浏览器套件，不能给整体通过结论。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts`](../../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)
- [`packages/rxdb-adapter-http/src/transport.ts`](../../../../packages/rxdb-adapter-http/src/transport.ts)
- [`packages/rxdb-adapter-http/src/conditional-cache.ts`](../../../../packages/rxdb-adapter-http/src/conditional-cache.ts)
- [`packages/rxdb-adapter-http/src/pagination.ts`](../../../../packages/rxdb-adapter-http/src/pagination.ts)
- [`packages/rxdb-adapter-http/src/change-feed.ts`](../../../../packages/rxdb-adapter-http/src/change-feed.ts)
- [`packages/rxdb-adapter-http/src/http.interface.ts`](../../../../packages/rxdb-adapter-http/src/http.interface.ts)
- [`packages/rxdb-adapter-http/README.md`](../../../../packages/rxdb-adapter-http/README.md)

## 2. 评审意见

本次已读范围内没有新增确认问题；**不是全包无缺陷或门禁通过**。其余 C 项继续待核查。

## 3. 动态证据与复验

本包本轮无独立动态通过证据。

业务源码基线 `58b4bbb61efa71d4591cafab6a4c92955a7760dd`。SQL 复验明确关闭覆盖率；测试失败是预期的缺陷红灯，非 worker/service stopped 并发假失败。覆盖率未测量，也没有执行修复。

## 4. 尚未完成

- [ ] 原计划其余源码、C 项及真实运行环境补证。
- [ ] 针对确认问题先保持红测试，再最小修复、绿、重构。
- [ ] 适用的三框架/真实宿主及公开 API 兼容回归。
- [ ] 四项覆盖率、整包门禁与实际应用/E2E 链路。

原计划：[对应对象评审计划](../../packages/rxdb-adapter-http.md)；进度：全范围执行台账。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

QueryCache 的 HTTP remote adapter：规则查询、条件缓存、分页、变更流与 transport。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts`](../../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)
- [`packages/rxdb-adapter-http/src/handler-contract.ts`](../../../../packages/rxdb-adapter-http/src/handler-contract.ts)
- [`packages/rxdb-adapter-http/src/rest.ts`](../../../../packages/rxdb-adapter-http/src/rest.ts)
- [`packages/rxdb-adapter-http/src/transport.ts`](../../../../packages/rxdb-adapter-http/src/transport.ts)
- [`packages/rxdb-adapter-http/src/pagination.ts`](../../../../packages/rxdb-adapter-http/src/pagination.ts)
- [`packages/rxdb-adapter-http/src/conditional-cache.ts`](../../../../packages/rxdb-adapter-http/src/conditional-cache.ts)
- [`packages/rxdb-adapter-http/src/change-feed.ts`](../../../../packages/rxdb-adapter-http/src/change-feed.ts)
- [`packages/rxdb-adapter-http/package.json`](../../../../packages/rxdb-adapter-http/package.json)
- [`packages/rxdb-adapter-http/project.json`](../../../../packages/rxdb-adapter-http/project.json)
- [`packages/rxdb-adapter-http/src/index.ts`](../../../../packages/rxdb-adapter-http/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 端到端线契约：逐项对照 adapter、handler-contract、reference-server 与 HTTP 应用服务端；核查 RuleGroup 和错误映射。
- [ ] C2 分页与条件请求：检查 opaque page token、ETag/304、过滤排序与 cache identity 的一致性。
- [ ] C3 变更流生命周期：核查 reconnect、cursor、取消、订阅者清理和失效范围，不让断流被视为已同步。
- [ ] C4 写入与 outbox 衔接：追踪 bulk/chunking、条件失败和 QueryCache offline write 到 sync outbox，检查幂等和重试归属。
- [ ] C5 取消与不可信响应：检查 AbortSignal、晚到响应、响应体大小与类型转换。
- [ ] C6 CORS / 凭证 / 生产消费：审查 transport 凭证和日志边界，核查 server 配合而非只看 client 配置。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

C1/C4/C5 **部分执行**。原 HTTP adapter、REST handlers、native fetch 对原应用/PGlite 发真实 metadata/by-ids/PATCH/删除请求，真实 401 映射和网络拒绝不是 Response 桩。失败状态的责任在 RV-052（已修复，见 README 2026-10-05 清理记录），缓存/共享结算在 RV-053（已修复，见 README 2026-10-05 清理记录）/RV-054（已修复，见 README 2026-10-05 清理记录），旧修复覆盖新写在 RV-055（已修复，见 README 2026-10-05 清理记录）。没有因此给 HTTP adapter 四条重复意见。SSE/ETag/分页、CORS 和打包 consumer 未由本轮验收。

本轮实际链路与取证限制 · 完整日志 · 提交/wire/队列观测。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：strict lint、typecheck；当轮门禁限定。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                  | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 端到端线契约           | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/handler-contract.ts:42-76 assertHandlerRow/assertHandlerVersion`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/metadata.ts:39-94 canonicalizeMetadata`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/transport.ts:190-195 assertOk、311-318 decodeJson`<br>persisted row/version/metadata 有显式类型校验；非2xx不解码为空集合，非法JSON明确报错。线契约不是仅入口导出核对。当前 strict lint/typecheck与依赖build有实测，协议测试尚未由本子任务重跑。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控运行本包test与HTTP server真实wire：未知字段/操作、注入条件、content-type、畸形JSON、4xx/5xx；确认无副作用并保留错误码。生产消费与body所有类型还未覆盖。             |
| C2 分页与条件请求         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/pagination.ts:103-153 fetchAllMetadataPages`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/conditional-cache.ts:103-108 requestFingerprint`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/transport.ts:385-393 sendJson、622-639 #sendJsonConditional`<br>页形状锁定；token不推进、空页与总页数上限fail-fast，不以截断数据成功返回。条件缓存用method/url/序列化body/handler headers分键，304复用原值。auth不进键是公开前置条件，不另报缺陷。         | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮test/E2E未收结果；补筛选改变后旧token、更新/删除中分页、无缓存304、跨scope以及按README disconnect/connect换身份。当前server token仅a/w游标，非签名或scope绑定证据。 |
| C3 变更流生命周期         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/change-feed.ts:155-169 start/stop、172-284 #connect/#fail/#close、316-343 #handleOpen/#handleMessage`<br>重连接通时全实体失效弥补断流；停止会清timer/close EventSource并解绑回调。不是带历史cursor的durable replay流；同clientId通知被抑制。与server合批来源候选A关联，未动态确认。                                                                                                                                                                                                              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实SSE断线重连、重复/乱序、最后订阅退出；候选A需实际PGlite batch与双客户端验证。不要把没有实现的历史cursor replay当已测能力。                                      |
| C4 写入与 outbox 衔接     | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/chunking.ts:46-67 findByIdsInChunks`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:446-487 saveMany/removeMany/mutations拒绝路径`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts:68-108 远端持久化断言`<br>findByIds分块后统一返回，非数组响应拒绝；bulk/sync原语的边界与QueryCache/outbox归属分开。已有真实HTTP/SQLite旧取证不作为这次test通过；历史outbox修复不重开RV。                                   | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控本轮原包test+local-first-writes，超时但服务端已写、部分批失败、离线重连/删除重试需真实wire/outbox对照；不能仅UI pending变0代证。                                    |
| C5 取消与不可信响应       | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/transport.ts:501-517 classify、529-548 #prepare、569-597 #send、311-318 decodeJson`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:209-268 connect/disconnect`<br>断开信号与timeout分开分类，fetch和body消费同处try/finally，timer被清理；connect/disconnect换transport并终止旧请求。响应text读取没有在所读路径证明body字节上限。                                                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控慢body/晚到响应、auth await期间断开、卸载、快速参数变化和超大/非法数字二进制响应；本轮无这些动态证据，不把未见容量限制直接包装成已复现OOM。                         |
| C6 CORS / 凭证 / 生产消费 | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/src/transport.ts:477-486 buildHeaders、535-546 #prepare`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-http/README.md:227-231 换身份前置条件`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/cors.ts:52-74 applyCorsHeaders`<br>auth在每次发请求前求值且覆盖静态header；handler变体入缓存键。换身份必须disconnect/connect，直接换token并非支持路径。demo回显origin/假Bearer不构成生产鉴权证明。                                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 受控server真实未授权origin/credentials与跨scope拒绝、日志无token敏感body、pack后consumer仍待证；当前依赖build不是独立发布消费。                                         |

证据：逐C矩阵、实际阅读、验证请求、待主控去重候选、历史验证分账。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
