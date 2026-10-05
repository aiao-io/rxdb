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

确认意见：[RV-059](../../RV-059-supabase-bulk-delete-url-overflow.md)、[RV-060](../../RV-060-supabase-querycache-relation-metadata-missing.md)。全批门禁、接缝和中间取证错误见 [本轮执行台账](../../execution-2026-10-05-supabase.md)；[源码指纹](../../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。
