---
kind: review-execution
object: dev-rxdb-supabase
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-supabase：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular wa-sqlite + Supabase 本地优先同步演示，区分本地/远端部署和凭证档位。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-supabase/src/app/app.service.ts`](../../../../apps/dev-rxdb-supabase/src/app/app.service.ts)
- [`apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts`](../../../../apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts)
- [`apps/dev-rxdb-supabase/src/app/supabase-sync.ts`](../../../../apps/dev-rxdb-supabase/src/app/supabase-sync.ts)
- [`apps/dev-rxdb-supabase/src/app/remote-sync-state.ts`](../../../../apps/dev-rxdb-supabase/src/app/remote-sync-state.ts)
- [`apps/dev-rxdb-supabase/src/app/remote-security-notice.ts`](../../../../apps/dev-rxdb-supabase/src/app/remote-security-notice.ts)
- [`apps/dev-rxdb-supabase/src/app/branch-manager.ts`](../../../../apps/dev-rxdb-supabase/src/app/branch-manager.ts)
- [`apps/dev-rxdb-supabase/project.json`](../../../../apps/dev-rxdb-supabase/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 构建 / 运行配置：核查 runtime config、build env 固化、local/remote 模式和服务地址；不要用复用旧 server 掩盖错 bundle。
- [ ] C2 凭证与 RLS 边界：审查客户端允许的 key、audit-secrets 和安全提示；与 adapter 和 SQL/RPC 部署联审。
- [ ] C3 离线同步状态：追踪 todo 交互、sync task、Realtime 与 remote-sync-state，错误不只做状态提示。
- [ ] C4 本地库与分支：核查 wa-sqlite Worker/SharedWorker、命名、branch manager 和两种 Todo 分页。
- [ ] C5 真实场景与隔离：将组件单测、默认 E2E 和 e2e-remote 证据分开，不把 remote skip 当远端通过。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- [当前 build 后凭证审计通过](../../evidence/2026-10-03/full-run/secrets-audit.txt)。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 47 条整套单测，4 条 local E2E，2 条 remote E2E 实际执行。本批没有新增应用独立缺陷；当前 Todo 是 Full 策略/公开 schema，不能把 adapter 原语和 shop QueryCache 缺陷冒称已复现 UI 故障。

确认意见：本轮无新增对象独立 RV，不意味着全对象通过。全批门禁、接缝和中间取证错误见 [本轮执行台账](../../execution-2026-10-05-supabase.md)；[源码指纹](../../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

本轮当前 production build 留有 initial 1.33 MB > 1.00 MB 的预算警告；构建/凭证审计退出 0，不记成无警告构建。详见同批审计原日志，未擅自调高预算。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../../evidence/2026-10-05/parallel/integrations/current-gates.json)。

Supabase历史基线：`b7edef590051c8842d4914e30e31475977dea6ac`，2026-10-05 07:48 app:test 47、08:04 local4、08:05 remote2；package交付557pass/5fail/0skip，原553全过。**不是这次parallel门禁**。RV-059/060/061仍Open，只引用不重复登记。

| C / 专项           | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| C1 构建 / 运行配置 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/runtime-config.ts:51-63 readSupabaseConfig`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/supabase-sync.ts:21-56 connectSupabase/resolveRemoteSync`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts:15-66 local/remote配置`<br>URL/key都缺时本地模式；半配置或非公开key显式失败；resolver失败标未连接并抛错，不假装remote成功。app本轮strict lint/typecheck过，构建/运行语义仍需补。                          | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前冷local/remote build与运行，错URL/key/端口/旧dist/远端不可达逐项验证；不使用未知生产env。           |
| C2 凭证与 RLS 边界 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/runtime-config.ts:26-63 public key判断`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/remote-security-notice.ts:9-16 未认证/RLS警告`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/scripts/audit-build-credentials.mjs:22-35,54-85 scanBuildArtifacts`<br>警告直接声明createdBy/updatedBy不是身份；public key检查与bundle审计是凭证边界，不等同RLS身份隔离。先前build后审计仅历史证据。                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮冷build后audit-secrets和跨受限身份读写拒绝；认证/RLS缺失不写不适用，service-role成功不算隔离。          |
| C3 离线同步状态    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/todo/todo.page.ts:193-225 CRUD错误、327-345 #sync`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/remote-sync-state.ts:20-28 markConnected`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/todo-interactions.ts:31-65 乐观值恢复`<br>CRUD失败重置/保留错误；Push/Pull pending在finally清理并显示错误。RemoteSyncState是resolver连接状态，不是逐条远端确认；UI不只成功灯，E2E跨context验证push/pull但无离线失败矩阵。                  | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控离线写后重连、重复Push/Pull、拒绝/冲突、切branch和重开；逐操作远端确认/pending与真实数据一致性仍未证。  |
| C4 本地库与分支    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts:17-66 dbName/Worker/SharedWorker`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/branch-manager.ts:182-209 create/switch finally`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/todo-cursor/todo-cursor.page.ts:74-118 completed/id游标`<br>本地库名和worker作用域明确；branch操作防重复、失败有alert、finally复位；Todo排序用completed后id打破同值。仅看到普通同值游标配置，不证明所有nullable与跨tab行为。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控多标签共享库、初始化退出/关闭重连、nullable/同值翻页、分支切换限制；核心/框架依赖问题不在本对象擅自修。 |
| C5 真实场景与隔离  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/home.spec.ts:103-154 reload/跨页断言`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:11-59 跨contextPush/Pull`<br>历史2026-10-05 07:48 app:test 47例、08:04 local4、08:05 remote2均先前运行；remote跨context有实际数据判别力，且明确未认证。不能冒充parallel当前门禁或身份隔离。                                                                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控后补当轮app:test、本地/远端E2E与隔离资源回收；默认remote未运行/skip按未测记，故全对象partial。          |

证据：[逐C矩阵](../../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
