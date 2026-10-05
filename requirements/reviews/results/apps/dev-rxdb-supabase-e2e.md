---
kind: review-execution
object: dev-rxdb-supabase-e2e
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-supabase-e2e：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Supabase 演示的本地烟测与显式 remote-sync 用户链路。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-supabase-e2e/playwright.config.ts`](../../../../apps/dev-rxdb-supabase-e2e/playwright.config.ts)
- [`apps/dev-rxdb-supabase-e2e/src/home.spec.ts`](../../../../apps/dev-rxdb-supabase-e2e/src/home.spec.ts)
- [`apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts`](../../../../apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts)
- [`apps/dev-rxdb-supabase-e2e/package.json`](../../../../apps/dev-rxdb-supabase-e2e/package.json)
- [`apps/dev-rxdb-supabase-e2e/project.json`](../../../../apps/dev-rxdb-supabase-e2e/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `e2e`       | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/e2e.txt)       |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 local / remote 证据分离：对照默认 e2e、REMOTE_E2E/e2e-remote、deployedURL 与 skip 条件。
- [ ] C2 build 固化配置与端口：审查 dependsOn build、serve-e2e、环境变量和拒绝复用旧 server 的策略。
- [ ] C3 同步与持久化闭环：检查跨客户端/刷新/离线恢复的真实远端确认，不能只看连接指示灯。
- [ ] C4 身份与 RLS：核查专用 Supabase 测试帐号、权限/RPC 和跨身份失败场景。
- [ ] C5 外部资源与清理：检查数据标记、teardown、配额和失败时清理，禁止真实项目污染。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 默认 4 条与显式远端 2 条分开测量，无 BASE_URL、workers=1、retries=0、reuseExistingServer=false；未认证/RLS/离线恢复/最后删除确认与失败清理不算完整通过。

确认意见：本轮无新增对象独立 RV，不意味着全对象通过。全批门禁、接缝和中间取证错误见 [本轮执行台账](../../execution-2026-10-05-supabase.md)；[源码指纹](../../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../../evidence/2026-10-05/parallel/integrations/current-gates.json)。

Supabase历史基线：`b7edef590051c8842d4914e30e31475977dea6ac`，2026-10-05 07:48 app:test 47、08:04 local4、08:05 remote2；package交付557pass/5fail/0skip，原553全过。**不是这次parallel门禁**。RV-059/060/061仍Open，只引用不重复登记。

| C / 专项                   | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                               | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| C1 local / remote 证据分离 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/playwright.config.ts:5-11 REMOTE_E2E/port/deployedURL、98-109 webServer`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:9-11 remote describe`<br>local/remote由显式REMOTE_E2E与不同port区分；remote例仅remote模式注册。旧08:04 local4与08:05 remote2日志分别存在，不合并为当前全过。              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮两个target结果由主控后补；未执行/未注册/skip逐项列明，local4不能证明remote。                                      |
| C2 build 固化配置与端口    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/playwright.config.ts:98-109 预建产物serve/拒绝复用`<br>`主控resolved graph e2e/e2e-remote dependsOn dev-rxdb-supabase:build`<br>本地target有build依赖且webServer不复用；BASE_URL可跳过自建server，需另验其来源。remote serve-remote与local serve-e2e分支明确。                                                                             | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前冷构建、错config/旧dist/端口占用，确认浏览器bundle指向受控stack；不对未知deployedURL取证。                    |
| C3 同步与持久化闭环        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:24-49 Push后另一context Pull可见、61-95 未Push负对照`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/home.spec.ts:103-115 local reload`<br>跨context成功与未Push不可见负对照强于请求成功灯；local reload证明本地路径。remote仅正常Push/Pull，不覆盖断线/重试/冲突，也未确认清理后的远端删除。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前运行并补断线重连/拒绝/冲突、远端删除确认；候选B数据回收静态缺口另分流，未动态复验。                           |
| C4 身份与 RLS              | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:20-22,70-71 明确未认证警告`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/remote-security-notice.ts:13-15 身份提示`<br>现有remote两例明确未启用身份认证；没有两个受限身份跨读写/越权拒绝断言。此C未核销，不把未认证demo成功当RLS通过。                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控受控checkout-isolated stack测试账号A/B、RLS/RPC权限与privileged key不进页面；环境不足保持未验证，不标不适用。     |
| C5 外部资源与清理          | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:24-59 unique title/正常删除、50-52 finally仅closeContext`<br>uniqueTitle降低冲突，但数据删除只在前序成功后运行；finally不清远端数据，最后只数RPC请求而未确认删除。候选B是旧cleanup缺口具体化，不是本轮动态确认。                                                                                                   | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控分流失败注入/Push超时/删除拒绝后teardown，按唯一id/scope从受限身份确认无残留；仅授权隔离stack，不碰未知生产远端。 |

证据：[逐C矩阵](../../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
