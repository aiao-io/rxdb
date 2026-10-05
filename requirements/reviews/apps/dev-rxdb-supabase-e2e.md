---
kind: review-plan
object: dev-rxdb-supabase-e2e
source_root: apps/dev-rxdb-supabase-e2e
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-supabase-e2e：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Supabase 演示的本地烟测与显式 remote-sync 用户链路。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-supabase-e2e`](../../../apps/dev-rxdb-supabase-e2e)          |
| Nx 项目             | `dev-rxdb-supabase-e2e`                                                      |
| npm 名称            | `@aiao/dev-rxdb-supabase-e2e`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W6 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 8 个；测试/共享套件入口 2 个（按文件名，不代表覆盖率）                       |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`playwright.config.ts`](../../../apps/dev-rxdb-supabase-e2e/playwright.config.ts)
- [`src/home.spec.ts`](../../../apps/dev-rxdb-supabase-e2e/src/home.spec.ts)
- [`src/remote-sync.spec.ts`](../../../apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts)
- [`README.md`](../../../apps/dev-rxdb-supabase-e2e/README.md)
- [`package.json`](../../../apps/dev-rxdb-supabase-e2e/package.json)
- [`project.json`](../../../apps/dev-rxdb-supabase-e2e/project.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-supabase-e2e/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                    | 核查动作                                                              | 最低复验场景 / 证据要求                                                                | 状态                          |
| ---- | ----------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- |
| C1   | local / remote 证据分离 | 对照默认 e2e、REMOTE_E2E/e2e-remote、deployedURL 与 skip 条件。       | 默认模式和显式 remote 模式分别运行；remote 未跑/被 skip 标未验证，不能合并成全部通过。 | 部分核查；见2026-10-05逐C结论 |
| C2   | build 固化配置与端口    | 审查 dependsOn build、serve-e2e、环境变量和拒绝复用旧 server 的策略。 | 冷 build、错 key/url、旧产物、端口冲突；真实页面使用的是本轮配置。                     | 部分核查；见2026-10-05逐C结论 |
| C3   | 同步与持久化闭环        | 检查跨客户端/刷新/离线恢复的真实远端确认，不能只看连接指示灯。        | 本地写、远端可读、第二客户端可见、断线重连、失败/冲突；pending 与成功有实证。          | 部分核查；见2026-10-05逐C结论 |
| C4   | 身份与 RLS              | 核查专用 Supabase 测试帐号、权限/RPC 和跨身份失败场景。               | 受限用户读写、越权拒绝、privileged key 不进页面；service-role bypass 不算隔离证据。    | 部分核查；见2026-10-05逐C结论 |
| C5   | 外部资源与清理          | 检查数据标记、teardown、配额和失败时清理，禁止真实项目污染。          | 唯一测试 scope、重复执行、失败中断、环境不齐；资源缺失明确阻断动态评审但继续静态核查。 | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **2** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/home.spec.ts`](../../../apps/dev-rxdb-supabase-e2e/src/home.spec.ts)
- [`src/remote-sync.spec.ts`](../../../apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts)

运行配置：[`playwright.config.ts`](../../../apps/dev-rxdb-supabase-e2e/playwright.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

E2E 项目不以 spec 数或场景数折算业务覆盖率；以关键用户旅程、反向场景、实际宿主/平台与 skip 明细验收。生产代码覆盖率归对应应用/包，当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`dev-rxdb-supabase`](dev-rxdb-supabase.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-supabase`](dev-rxdb-supabase.md)、[`rxdb-adapter-supabase`](../packages/rxdb-adapter-supabase.md)。

## 5. 执行命令与环境

前置环境：默认本地模式与显式远端模式分别配置；remote 仅允许隔离 Supabase 项目/帐号，禁止生产表。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target    | 用途与证据边界                                                     |
| ------------ | ------------------------------------------------------------------ |
| `lint`       | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck`  | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `e2e`        | 当前 Playwright 全套；记录宿主、浏览器、skip、trace 与数据隔离。   |
| `e2e-remote` | 独立远端 Supabase 档；只允许专用测试实例与可清理测试身份。         |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-supabase-e2e --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-supabase-e2e:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck --projects=dev-rxdb-supabase-e2e --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-supabase-e2e:e2e --skipRemoteCache --skipNxCache
```

- 远端档不放进默认本地初筛。确认专用测试实例、身份、seed/cleanup 与构建时环境后，再独立执行：

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-supabase-e2e:e2e-remote --skipRemoteCache --skipNxCache
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [x] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-supabase-e2e.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 默认 4 条与显式远端 2 条分开测量，无 BASE_URL、workers=1、retries=0、reuseExistingServer=false；未认证/RLS/离线恢复/最后删除确认与失败清理不算完整通过。

确认意见：本轮无新增对象独立 RV，不意味着全对象通过。全批门禁、接缝和中间取证错误见 [本轮执行台账](../execution-2026-10-05-supabase.md)；[源码指纹](../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../evidence/2026-10-05/parallel/integrations/current-gates.json)。

Supabase历史基线：`b7edef590051c8842d4914e30e31475977dea6ac`，2026-10-05 07:48 app:test 47、08:04 local4、08:05 remote2；package交付557pass/5fail/0skip，原553全过。**不是这次parallel门禁**。RV-059/060/061仍Open，只引用不重复登记。

| C / 专项                   | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                               | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| C1 local / remote 证据分离 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/playwright.config.ts:5-11 REMOTE_E2E/port/deployedURL、98-109 webServer`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:9-11 remote describe`<br>local/remote由显式REMOTE_E2E与不同port区分；remote例仅remote模式注册。旧08:04 local4与08:05 remote2日志分别存在，不合并为当前全过。              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮两个target结果由主控后补；未执行/未注册/skip逐项列明，local4不能证明remote。                                      |
| C2 build 固化配置与端口    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/playwright.config.ts:98-109 预建产物serve/拒绝复用`<br>`主控resolved graph e2e/e2e-remote dependsOn dev-rxdb-supabase:build`<br>本地target有build依赖且webServer不复用；BASE_URL可跳过自建server，需另验其来源。remote serve-remote与local serve-e2e分支明确。                                                                             | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前冷构建、错config/旧dist/端口占用，确认浏览器bundle指向受控stack；不对未知deployedURL取证。                    |
| C3 同步与持久化闭环        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:24-49 Push后另一context Pull可见、61-95 未Push负对照`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/home.spec.ts:103-115 local reload`<br>跨context成功与未Push不可见负对照强于请求成功灯；local reload证明本地路径。remote仅正常Push/Pull，不覆盖断线/重试/冲突，也未确认清理后的远端删除。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前运行并补断线重连/拒绝/冲突、远端删除确认；候选B数据回收静态缺口另分流，未动态复验。                           |
| C4 身份与 RLS              | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:20-22,70-71 明确未认证警告`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/remote-security-notice.ts:13-15 身份提示`<br>现有remote两例明确未启用身份认证；没有两个受限身份跨读写/越权拒绝断言。此C未核销，不把未认证demo成功当RLS通过。                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控受控checkout-isolated stack测试账号A/B、RLS/RPC权限与privileged key不进页面；环境不足保持未验证，不标不适用。     |
| C5 外部资源与清理          | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:24-59 unique title/正常删除、50-52 finally仅closeContext`<br>uniqueTitle降低冲突，但数据删除只在前序成功后运行；finally不清远端数据，最后只数RPC请求而未确认删除。候选B是旧cleanup缺口具体化，不是本轮动态确认。                                                                                                   | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控分流失败注入/Push超时/删除拒绝后teardown，按唯一id/scope从受限身份确认无残留；仅授权隔离stack，不碰未知生产远端。 |

证据：[逐C矩阵](../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
