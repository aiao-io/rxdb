---
kind: review-execution
object: dev-rxdb-http-e2e
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-http-e2e：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

真实 HTTP client/server 链路的 Playwright：条件请求、分页、CORS、离线写与变更流。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`apps/dev-rxdb-http-e2e/playwright.config.ts`](../../../../apps/dev-rxdb-http-e2e/playwright.config.ts)
- [`apps/dev-rxdb-http-e2e/src/support.ts`](../../../../apps/dev-rxdb-http-e2e/src/support.ts)
- [`apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts`](../../../../apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts)
- [`apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts`](../../../../apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts)
- [`apps/dev-rxdb-http-e2e/src/page-token.spec.ts`](../../../../apps/dev-rxdb-http-e2e/src/page-token.spec.ts)
- [`apps/dev-rxdb-http-e2e/src/change-feed.spec.ts`](../../../../apps/dev-rxdb-http-e2e/src/change-feed.spec.ts)
- [`apps/dev-rxdb-http-e2e/package.json`](../../../../apps/dev-rxdb-http-e2e/package.json)
- [`apps/dev-rxdb-http-e2e/project.json`](../../../../apps/dev-rxdb-http-e2e/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `e2e`       | 本轮通过（限定当前配置/平台） | 执行日志       |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 双服务来源与隔离：核查 Playwright 启动 server/frontend 的配置、端口、build 与 DB/reset 范围，拒绝旧进程假绿。
- [ ] C2 离线写→联网闭环：检查 local-first-writes 与 offline-fallback 是否真实切断请求并验证 outbox/远端状态。
- [ ] C3 分页与条件请求：审查 token/ETag/304/412 的抓包与结果断言。
- [ ] C4 流与 CORS 安全：核查真实 SSE/变更流断线、订阅清理与 origin/credentials 拒绝，不仅 mock 响应。
- [ ] C5 清理与错误断言：检查 clear-and-paging/orphan-cleanup 是否独立验证数据库和订阅收束，审查 skip 与 console/network errors。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：strict lint、typecheck；当轮门禁限定。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项            | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| C1 双服务来源与隔离 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/playwright.config.ts:16-22 apiCommand、61-75 webServer`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/env.ts:E2E_DATABASE/API_PORT 声明`<br>真实server以隔离E2E数据库reset/seed/serve，前端只serve预建产物；两服务reuseExistingServer=false，workers=1避免全局控制状态互相覆盖。                                                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前冷依赖build+e2e日志后补；端口冲突/服务来源/数据目录需核对，不复用现有用户server。src/env.ts仅配置清单已解析，目录实际运行未证。 |
| C2 离线写→联网闭环  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts:68-124 离线create/远端409`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/offline-fallback.spec.ts:23-60 传输离线与409对照`<br>离线写当场本地可见，联网后pending=0再查远端行；409不降级且队列为0。这些断言有判别力，不是仅成功灯。                                                                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮未取得e2e结果；还需离线update/delete、Push超时但已提交、失败重试、刷新后outbox完整闭环，不由create成功覆盖。                        |
| C3 分页与条件请求   | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/page-token.spec.ts:25-70 首页面无token/续页有token/250唯一id`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts:141-198 304与新写后200`<br>token用请求体证明确实续页，且检查id唯一与排序；304用请求headers+server日志+页面行数交叉，写后须出现200。                                                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮运行由主控后补；空/同值游标、页间写删、旧filter token、304无缓存和错误token没有由这两条正常场景证明。                               |
| C4 流与 CORS 安全   | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/change-feed.spec.ts:103-159 接通失效/双页面可见`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/cors.spec.ts:47-64 预检allow headers/origin`<br>feed用重连失效计数和双页面2秒可见性断言，不只看connected。CORS允许origin与预检覆盖，不是未授权origin拒绝测试；合批来源候选A需主控分流。                                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 当前e2e待主控；断流/混合写入者合批/最后订阅退出及credential/CORS拒绝需补证。                                                            |
| C5 清理与错误断言   | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts:64-66 resetDemo beforeEach`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/orphan-cleanup.spec.ts:19-50 reset/删除/离线reload`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/playwright.config.ts:31-33 workers/retries`<br>每例reset、串行worker与离线/409错误对照能区分真实失败；orphan通过远端删除和离线刷新交叉。失败cleanup/interrupted过程未运行，不自动全绿。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控保留失败与重试原日志，验证中断时服务/DB释放、控制fault复位和重复执行；不能以重试成功抹原始失败。                                    |

证据：逐C矩阵、实际阅读、验证请求、待主控去重候选、历史验证分账。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
