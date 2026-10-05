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
