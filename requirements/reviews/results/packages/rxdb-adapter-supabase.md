---
kind: review-execution
object: rxdb-adapter-supabase
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-supabase：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Supabase remote adapter、repository、PostgREST 规则、分页、Realtime 与 RLS 边界。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`](../../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)
- [`packages/rxdb-adapter-supabase/src/SupabaseRepository.ts`](../../../../packages/rxdb-adapter-supabase/src/SupabaseRepository.ts)
- [`packages/rxdb-adapter-supabase/src/rule_group_builder.ts`](../../../../packages/rxdb-adapter-supabase/src/rule_group_builder.ts)
- [`packages/rxdb-adapter-supabase/src/pagination.ts`](../../../../packages/rxdb-adapter-supabase/src/pagination.ts)
- [`packages/rxdb-adapter-supabase/src/supabase.rls.ts`](../../../../packages/rxdb-adapter-supabase/src/supabase.rls.ts)
- [`packages/rxdb-adapter-supabase/src/handle_supabase_change.ts`](../../../../packages/rxdb-adapter-supabase/src/handle_supabase_change.ts)
- [`packages/rxdb-adapter-supabase/package.json`](../../../../packages/rxdb-adapter-supabase/package.json)
- [`packages/rxdb-adapter-supabase/project.json`](../../../../packages/rxdb-adapter-supabase/project.json)
- [`packages/rxdb-adapter-supabase/src/index.ts`](../../../../packages/rxdb-adapter-supabase/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 独立 Supabase 环境通过        | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 身份与 RLS：对照 entity_scope、RLS helpers、SQL/RPC、应用配置与 public/privileged key 边界。
- [ ] C2 PostgREST 与类型映射：审查规则嵌套、escaping、关系、transform 和 error mapping。
- [ ] C3 批写、分支与 RPC：核查 mutations/merge changes 的原子性、幂等、主分支/其它分支的现有边界。
- [ ] C4 分页与实时失效：审查分页 token、Realtime 订阅建立/销毁和过期消息对 repository 的影响。
- [ ] C5 真实环境测试：核查 test-env/Docker 的建表、权限、reset/seed 与测试帐号；mock 只能证明局部映射。
- [ ] C6 依赖与客户端安全：对照 peer exports、前端 bundle、日志和错误提示；核查凭证审计在应用 build 之后运行。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 实际 SDK/REST 与普通仓储/metadata 对照，确认两项；1100 行 upsert 截断猜测被否定。未通过 RLS/Realtime/发布消费完整专题。

确认意见：RV-059、RV-060。全批门禁、接缝和中间取证错误见 [本轮执行台账](../../execution-2026-10-05-supabase.md)；[源码指纹](../../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../../evidence/2026-10-05/parallel/integrations/current-gates.json)。

Supabase历史基线：`b7edef590051c8842d4914e30e31475977dea6ac`，2026-10-05 07:48 app:test 47、08:04 local4、08:05 remote2；package交付557pass/5fail/0skip，原553全过。**不是这次parallel门禁**。RV-059/060/061仍Open，只引用不重复登记。

| C / 专项                | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 身份与 RLS           | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:101-127 client/connect、776-827 #verifyRlsConfiguration`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/supabase.rls.ts:13-28 默认warn、75-80 handleRlsCheckFailure`<br>可注入已认证client；RLS self-check检查表exists/rlsEnabled，默认warn而非启用RLS或策略验证。身份必须来自Supabase Auth/server policy，不来自rxdb.context.userId。demo与remote E2E明确未认证。                                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | checkout-isolated stack上至少A/B两个受限身份、读写/无可见行/删除拒绝、RPC权限与service-role对照；当前remote两例不覆盖这些，未拿默认warn当隔离证明。   |
| C2 PostgREST 与类型映射 | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/postgrest-error.ts:49-81 is_transport_failure/classify、134-144 assert_postgrest_ok`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/entity_scope.ts:37-64 resolveEntityScope`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:585-608 fetchMetadata`<br>status=0才判传输失败，其余权限/SQL错误保持数据错误；entity scope按已配置namespace消歧。metadata仍缺关系上下文/SELECT是RV-060 Open，不新报；RV-061为联审依赖问题。                                  | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控本轮test保留RV-059/060/061已知失败；关系exists/notExists、类型映射、二进制/BigInt/日期与列名映射需当前实际SDK/PostgREST证据。                     |
| C3 批写、分支与 RPC     | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:169-225 saveMany/removeMany/mutations、638-654 executeRetryableWrite、744-754 删除结果校验`<br>REST save/remove与事务RPC mutations分开；删除缺返回id显式失败，批大小URL问题仍RV-059。RPC构造upserts/deletes并传上下文userId，不能因此说已验证server认证或每操作权限。                                                                                                                                                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮隔离Docker测试、RPC部署与逐操作确认/拒绝/回滚、branch切换、大批/重复ID/部分失败待主控；不把REST拆块语义伪装跨块事务。                             |
| C4 分页与实时失效       | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/pagination.ts:69-86 select_all_pages`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:138-148 disconnect、830-887 Realtime subscribe/reconnect`<br>分页到短页才终止，Realtime断开清timer/removeChannel，旧channel回调比较当前实例；SUBSCRIBED刷新pullable count。不由offset分页证明并发写时快照完整。                                                                                                                                                                               | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实网关>1000行、写入/删除中翻页、Realtime断流/重连/频道关闭和跨namespace失效；TS/mock计数不代替实际RLS Realtime。                                |
| C5 真实环境测试         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:585-608 fetchMetadata 实际SDK路径`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/pagination.ts:69-86 SDK分页`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/__tests__/review-large-rest-writes.spec.ts、review-querycache-relations.spec.ts 原失败保留`<br>已核对10-05先前隔离环境final-counts：553原例均过，交付557pass/5fail/0skip；失败属于既有RV-059/060/061。此为早先baseline，不是parallel本轮整包结果。当前主控lint/typecheck及依赖build实际过。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮Supabase:test与认证/RPC/Realtime矩阵交主控；覆盖率四指标未收，本轮不能拿先前553或557当当前门禁。spec文件仅盘点/既有记录对照，不宣称本轮全文审阅。 |
| C6 依赖与客户端安全     | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:107-118 supplied client/createClient`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/runtime-config.ts:26-63 public key拒绝`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/scripts/audit-build-credentials.mjs:22-35,54-85 指纹审计`<br>adapter允许外部client，server/client安全不能混同；应用拒绝secret/service-role并只输出审计credential指纹。包依赖build/typecheck有当轮证据，不代证生产bundle无凭证或pack消费。                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前app冷build后audit-secrets、consumer及session轮换；SDK/RPC日志无token、privileged key不入浏览器，认证环境缺失时明确未验证。                    |

证据：[逐C矩阵](../../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
