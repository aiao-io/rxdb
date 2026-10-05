---
kind: review-plan
object: dev-rxdb-supabase
source_root: apps/dev-rxdb-supabase
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-supabase：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Angular wa-sqlite + Supabase 本地优先同步演示，区分本地/远端部署和凭证档位。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-supabase`](../../../apps/dev-rxdb-supabase)                  |
| Nx 项目             | `dev-rxdb-supabase`                                                          |
| npm 名称            | 不适用 / 未声明                                                              |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 57 个；测试/共享套件入口 10 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/app/app.service.ts`](../../../apps/dev-rxdb-supabase/src/app/app.service.ts)
- [`src/app/setup_rxdb_wa-sqlite.ts`](../../../apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts)
- [`src/app/supabase-sync.ts`](../../../apps/dev-rxdb-supabase/src/app/supabase-sync.ts)
- [`src/app/remote-sync-state.ts`](../../../apps/dev-rxdb-supabase/src/app/remote-sync-state.ts)
- [`src/app/remote-security-notice.ts`](../../../apps/dev-rxdb-supabase/src/app/remote-security-notice.ts)
- [`src/app/branch-manager.ts`](../../../apps/dev-rxdb-supabase/src/app/branch-manager.ts)
- [`README.md`](../../../apps/dev-rxdb-supabase/README.md)
- [`project.json`](../../../apps/dev-rxdb-supabase/project.json)
- [`tsconfig.app.json`](../../../apps/dev-rxdb-supabase/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-supabase/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项            | 核查动作                                                                                              | 最低复验场景 / 证据要求                                                                          | 状态                          |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| C1   | 构建 / 运行配置 | 核查 runtime config、build env 固化、local/remote 模式和服务地址；不要用复用旧 server 掩盖错 bundle。 | 缺 URL/key、错环境、生产与本地 build、远端不可达；失败明确且配置不会串档。                       | 部分核查；见2026-10-05逐C结论 |
| C2   | 凭证与 RLS 边界 | 审查客户端允许的 key、audit-secrets 和安全提示；与 adapter 和 SQL/RPC 部署联审。                      | 生产 bundle 不含 privileged key、跨身份读写拒绝、日志无凭证；audit-secrets 在当前 build 后执行。 | 部分核查；见2026-10-05逐C结论 |
| C3   | 离线同步状态    | 追踪 todo 交互、sync task、Realtime 与 remote-sync-state，错误不只做状态提示。                        | 离线写后重连、重复 sync、冲突/拒绝、切 branch、重开 app；pending 与已确认状态准确。              | 部分核查；见2026-10-05逐C结论 |
| C4   | 本地库与分支    | 核查 wa-sqlite Worker/SharedWorker、命名、branch manager 和两种 Todo 分页。                           | 多标签页、可空/同值游标、关闭重连、分支限制；对照 roadmap 已知边界，不扩承诺。                   | 部分核查；见2026-10-05逐C结论 |
| C5   | 真实场景与隔离  | 将组件单测、默认 E2E 和 e2e-remote 证据分开，不把 remote skip 当远端通过。                            | 隔离 Supabase 帐号/schema、真实 remote-sync、错误提示与键盘操作；不向生产表写测试数据。          | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **10** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/app/branch-manager.spec.ts`](../../../apps/dev-rxdb-supabase/src/app/branch-manager.spec.ts)
- [`src/app/remote-security-notice.spec.ts`](../../../apps/dev-rxdb-supabase/src/app/remote-security-notice.spec.ts)
- [`src/app/supabase-sync.spec.ts`](../../../apps/dev-rxdb-supabase/src/app/supabase-sync.spec.ts)
- [`src/app/build-credential-audit.spec.ts`](../../../apps/dev-rxdb-supabase/src/app/build-credential-audit.spec.ts)
- [`src/app/error-message.spec.ts`](../../../apps/dev-rxdb-supabase/src/app/error-message.spec.ts)
- [`src/app/runtime-config.spec.ts`](../../../apps/dev-rxdb-supabase/src/app/runtime-config.spec.ts)

运行配置：[`vite.config.mts`](../../../apps/dev-rxdb-supabase/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`angular`（集成边界）](../../../modules/angular)、[`rxdb`](../packages/rxdb.md)、[`rxdb-adapter-supabase`](../packages/rxdb-adapter-supabase.md)、[`rxdb-adapter-wa-sqlite`](../packages/rxdb-adapter-wa-sqlite.md)、[`rxdb-angular`](../packages/rxdb-angular.md)、[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-plugin-graph`](../packages/rxdb-plugin-graph.md)、[`rxdb-plugin-history`](../packages/rxdb-plugin-history.md)、[`rxdb-plugin-sync`](../packages/rxdb-plugin-sync.md)、[`rxdb-test`](../packages/rxdb-test.md)、[`utils`](../packages/utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-supabase-e2e`](dev-rxdb-supabase-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-supabase-e2e`](dev-rxdb-supabase-e2e.md)、[`rxdb-adapter-supabase`](../packages/rxdb-adapter-supabase.md)。

## 5. 执行命令与环境

前置环境：隔离 Supabase/Docker 与真实浏览器；远端验证仅在专用项目且显式提供测试身份。先 build 再运行 audit-secrets。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target       | 用途与证据边界                                                         |
| --------------- | ---------------------------------------------------------------------- |
| `lint`          | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`     | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`          | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`         | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `audit-secrets` | 当前 build 后的前端凭证审计；旧 dist 的检查不能充当本轮证据。          |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-supabase --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-supabase:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=dev-rxdb-supabase --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-supabase:test --coverage --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-supabase:audit-secrets --skipRemoteCache --skipNxCache
```

- `audit-secrets` 依赖当前 `build`；记录构建时环境与产物路径，不把旧 `dist` 的审计结果移作本轮凭证。

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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-supabase.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 47 条整套单测，4 条 local E2E，2 条 remote E2E 实际执行。本批没有新增应用独立缺陷；当前 Todo 是 Full 策略/公开 schema，不能把 adapter 原语和 shop QueryCache 缺陷冒称已复现 UI 故障。

确认意见：本轮无新增对象独立 RV，不意味着全对象通过。全批门禁、接缝和中间取证错误见 [本轮执行台账](../execution-2026-10-05-supabase.md)；[源码指纹](../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

本轮当前 production build 留有 initial 1.33 MB > 1.00 MB 的预算警告；构建/凭证审计退出 0，不记成无警告构建。详见同批审计原日志，未擅自调高预算。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../evidence/2026-10-05/parallel/integrations/current-gates.json)。

Supabase历史基线：`b7edef590051c8842d4914e30e31475977dea6ac`，2026-10-05 07:48 app:test 47、08:04 local4、08:05 remote2；package交付557pass/5fail/0skip，原553全过。**不是这次parallel门禁**。RV-059/060/061仍Open，只引用不重复登记。

| C / 专项           | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| C1 构建 / 运行配置 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/runtime-config.ts:51-63 readSupabaseConfig`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/supabase-sync.ts:21-56 connectSupabase/resolveRemoteSync`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts:15-66 local/remote配置`<br>URL/key都缺时本地模式；半配置或非公开key显式失败；resolver失败标未连接并抛错，不假装remote成功。app本轮strict lint/typecheck过，构建/运行语义仍需补。                          | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控当前冷local/remote build与运行，错URL/key/端口/旧dist/远端不可达逐项验证；不使用未知生产env。           |
| C2 凭证与 RLS 边界 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/runtime-config.ts:26-63 public key判断`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/remote-security-notice.ts:9-16 未认证/RLS警告`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/scripts/audit-build-credentials.mjs:22-35,54-85 scanBuildArtifacts`<br>警告直接声明createdBy/updatedBy不是身份；public key检查与bundle审计是凭证边界，不等同RLS身份隔离。先前build后审计仅历史证据。                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮冷build后audit-secrets和跨受限身份读写拒绝；认证/RLS缺失不写不适用，service-role成功不算隔离。          |
| C3 离线同步状态    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/todo/todo.page.ts:193-225 CRUD错误、327-345 #sync`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/remote-sync-state.ts:20-28 markConnected`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/todo-interactions.ts:31-65 乐观值恢复`<br>CRUD失败重置/保留错误；Push/Pull pending在finally清理并显示错误。RemoteSyncState是resolver连接状态，不是逐条远端确认；UI不只成功灯，E2E跨context验证push/pull但无离线失败矩阵。                  | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控离线写后重连、重复Push/Pull、拒绝/冲突、切branch和重开；逐操作远端确认/pending与真实数据一致性仍未证。  |
| C4 本地库与分支    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts:17-66 dbName/Worker/SharedWorker`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/branch-manager.ts:182-209 create/switch finally`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase/src/app/todo-cursor/todo-cursor.page.ts:74-118 completed/id游标`<br>本地库名和worker作用域明确；branch操作防重复、失败有alert、finally复位；Todo排序用completed后id打破同值。仅看到普通同值游标配置，不证明所有nullable与跨tab行为。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控多标签共享库、初始化退出/关闭重连、nullable/同值翻页、分支切换限制；核心/框架依赖问题不在本对象擅自修。 |
| C5 真实场景与隔离  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/home.spec.ts:103-154 reload/跨页断言`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:11-59 跨contextPush/Pull`<br>历史2026-10-05 07:48 app:test 47例、08:04 local4、08:05 remote2均先前运行；remote跨context有实际数据判别力，且明确未认证。不能冒充parallel当前门禁或身份隔离。                                                                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控后补当轮app:test、本地/远端E2E与隔离资源回收；默认remote未运行/skip按未测记，故全对象partial。          |

证据：[逐C矩阵](../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
