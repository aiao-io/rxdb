---
kind: review-execution
object: dev-rxdb-http
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-http：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular HTTP/QueryCache 演示客户端，显示流量、ETag、分页和变更流诊断。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-http/src/app/app.ts`](../../../../apps/dev-rxdb-http/src/app/app.ts)
- [`apps/dev-rxdb-http/src/app/setup_rxdb_http.ts`](../../../../apps/dev-rxdb-http/src/app/setup_rxdb_http.ts)
- [`apps/dev-rxdb-http/src/app/paging.ts`](../../../../apps/dev-rxdb-http/src/app/paging.ts)
- [`apps/dev-rxdb-http/src/app/traffic-recorder.ts`](../../../../apps/dev-rxdb-http/src/app/traffic-recorder.ts)
- [`apps/dev-rxdb-http/src/app/change-feed-diagnostics.ts`](../../../../apps/dev-rxdb-http/src/app/change-feed-diagnostics.ts)
- [`apps/dev-rxdb-http/src/app/filter-rules.ts`](../../../../apps/dev-rxdb-http/src/app/filter-rules.ts)
- [`apps/dev-rxdb-http/project.json`](../../../../apps/dev-rxdb-http/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 初始化与依赖模式：核查 HTTP remote、wa-sqlite local、QueryCache/history/sync 插件和 recipes-domain 的配置归属。
- [ ] C2 离线写与缓存质量：追踪 UI 到 outbox 与确认，诊断必须区分 pending、错误、缓存部分数据和远端完整结果。
- [ ] C3 筛选、页码与 ETag：核查 filter rules、paging 和 ETag diagnostics 的身份，参数改变必须处理旧 token/旧页。
- [ ] C4 流量与变更流安全：检查 recorder/diagnostics 的容量、敏感 body、取消和 subscriber cleanup。
- [ ] C5 端到端对照：对照 server 与 HTTP E2E，使用真实请求和数据库状态证明；UI 控制接口仅属于隔离 demo。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../../evidence/2026-10-05/parallel/integrations/current-gates.json)。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项             | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| C1 初始化与依赖模式  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/setup_rxdb_http.ts:50-151 初始化/adapter/plugin注册`<br>单例RxDB显式使用wa-sqlite local、HTTP remote、SyncType.None，QueryCache/history/sync插件串联；远端用recipes映射，WASM按OPFS/SharedWorker能力建worker。未把demo行作为远端失败fallback。                                                                                                                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控app:test和冷build/E2E；服务不可达、WASM缺失、重复初始化与scope更换须单独运行。                                                    |
| C2 离线写与缓存质量  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/app.ts:210-214 useFind offlineFallback、294 useSyncState、503-517 create`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts:91-108 pending/实际by-ids对照`<br>UI本地保存、offlineFallback和库sync状态独立；现有E2E不是只看pending=0，还查服务器by-ids的id/title/price。旧HTTP/SWR历史修复不重复登记。                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮单测/E2E结果待主控；离线增改删、拒绝不入outbox、联网推送、重开、部分缓存与完整结果分辨仍须当前真实日志。                          |
| C3 筛选、页码与 ETag | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/app.ts:158-214 page/clamp/useFind、451-460 filter/page-size重置`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/filter-rules.ts:76-98 buildFilterRules`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/paging.ts:53-62 pageCount/clampPage`<br>filter和pageSize变化重置requestedPage，页码按缓存总数clamp；查询identity含where/limit/offset，规则只生成声明的字段/操作。ETag与token来自adapter而非UI伪计数。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控快速切页/filter、空/同值游标、过滤后删除导致末页缩小、304与token旧页；当前源码静态不代替浏览器并发验证。                          |
| C4 流量与变更流安全  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/traffic-recorder.ts:105-176 CAPACITY/installTrafficRecorder/onTraffic`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/app.ts:369-385 DestroyRef解除订阅`<br>traffic最多200条，记录method/path/status/duration，不记录headers/body；取消后恢复fetch，页面订阅有DestroyRef清理。SSE诊断和HTTP错误区分，不据日志说已同步。                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮大量流量/离开页面/失败response/敏感query URL与断流，确认所有subscriber/timer释放；file-inspection仅分段，不声称诊断每条分支已测。 |
| C5 端到端对照        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/offline-fallback.spec.ts:23-60 离线/409对照`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/orphan-cleanup.spec.ts:23-50 远端删→离线刷新`<br>E2E有真实HTTP错误与离线分类对照；orphan验证后端删除后页面消失并离线reload仍不存在，强于只看UI提示。CORS当前只证明允许origin，不证明拒绝。                                                                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮HTTP E2E运行待主控；恶意origin/token、候选A、对数据清理的失败路径与当前app bundle仍待补，不能以旧成功给全对象complete。           |

证据：[逐C矩阵](../../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
