---
kind: review-plan
object: dev-rxdb-http
source_root: apps/dev-rxdb-http
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-http：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Angular HTTP/QueryCache 演示客户端，显示流量、ETag、分页和变更流诊断。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-http`](../../../apps/dev-rxdb-http)                          |
| Nx 项目             | `dev-rxdb-http`                                                              |
| npm 名称            | 不适用 / 未声明                                                              |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 36 个；测试/共享套件入口 6 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/app/app.ts`](../../../apps/dev-rxdb-http/src/app/app.ts)
- [`src/app/setup_rxdb_http.ts`](../../../apps/dev-rxdb-http/src/app/setup_rxdb_http.ts)
- [`src/app/paging.ts`](../../../apps/dev-rxdb-http/src/app/paging.ts)
- [`src/app/traffic-recorder.ts`](../../../apps/dev-rxdb-http/src/app/traffic-recorder.ts)
- [`src/app/change-feed-diagnostics.ts`](../../../apps/dev-rxdb-http/src/app/change-feed-diagnostics.ts)
- [`src/app/filter-rules.ts`](../../../apps/dev-rxdb-http/src/app/filter-rules.ts)
- [`README.md`](../../../apps/dev-rxdb-http/README.md)
- [`project.json`](../../../apps/dev-rxdb-http/project.json)
- [`tsconfig.app.json`](../../../apps/dev-rxdb-http/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-http/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项              | 核查动作                                                                                      | 最低复验场景 / 证据要求                                                                   | 状态                          |
| ---- | ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| C1   | 初始化与依赖模式  | 核查 HTTP remote、wa-sqlite local、QueryCache/history/sync 插件和 recipes-domain 的配置归属。 | 服务不可达、WASM 不可用、重复初始化、换实体/scope；明确拒绝，不默默切演示数据。           | 部分核查；见2026-10-05逐C结论 |
| C2   | 离线写与缓存质量  | 追踪 UI 到 outbox 与确认，诊断必须区分 pending、错误、缓存部分数据和远端完整结果。            | 离线增删改、重连、部分失败、重开页面；界面不把缓存/排队称为服务端已成功。                 | 部分核查；见2026-10-05逐C结论 |
| C3   | 筛选、页码与 ETag | 核查 filter rules、paging 和 ETag diagnostics 的身份，参数改变必须处理旧 token/旧页。         | 筛选改变、相同排序值、304 无缓存、条件失败、快速切页；结果不串页。                        | 部分核查；见2026-10-05逐C结论 |
| C4   | 流量与变更流安全  | 检查 recorder/diagnostics 的容量、敏感 body、取消和 subscriber cleanup。                      | 大量请求、凭证字段、断流、离开页面、错误响应；诊断不泄露数据或拖垮内存。                  | 部分核查；见2026-10-05逐C结论 |
| C5   | 端到端对照        | 对照 server 与 HTTP E2E，使用真实请求和数据库状态证明；UI 控制接口仅属于隔离 demo。           | CORS 拒绝、orphan cleanup、page-token 篡改、offline fallback 契约；无需手改 UI 才能复验。 | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **6** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/app/change-feed-diagnostics.spec.ts`](../../../apps/dev-rxdb-http/src/app/change-feed-diagnostics.spec.ts)
- [`src/app/filter-rules.spec.ts`](../../../apps/dev-rxdb-http/src/app/filter-rules.spec.ts)
- [`src/app/paging.spec.ts`](../../../apps/dev-rxdb-http/src/app/paging.spec.ts)
- [`src/app/traffic-recorder.spec.ts`](../../../apps/dev-rxdb-http/src/app/traffic-recorder.spec.ts)
- [`src/app/demo-config.spec.ts`](../../../apps/dev-rxdb-http/src/app/demo-config.spec.ts)
- [`src/app/wa-sqlite-options.spec.ts`](../../../apps/dev-rxdb-http/src/app/wa-sqlite-options.spec.ts)

运行配置：[`vite.config.mts`](../../../apps/dev-rxdb-http/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`recipes-domain`（集成边界）](../../../modules/recipes-domain)、[`rxdb`](../packages/rxdb.md)、[`rxdb-adapter-http`](../packages/rxdb-adapter-http.md)、[`rxdb-adapter-wa-sqlite`](../packages/rxdb-adapter-wa-sqlite.md)、[`rxdb-angular`](../packages/rxdb-angular.md)、[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-plugin-history`](../packages/rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](../packages/rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](../packages/rxdb-plugin-sync.md)、[`utils`](../packages/utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-http-e2e`](dev-rxdb-http-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-http-e2e`](dev-rxdb-http-e2e.md)、[`rxdb-adapter-http`](../packages/rxdb-adapter-http.md)。

## 5. 执行命令与环境

前置环境：隔离 HTTP server 与浏览器；配套 Playwright 配置启动前后端。不要复用未知端口上的旧服务。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                         |
| ----------- | ---------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-http --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-http:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=dev-rxdb-http --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-http:test --coverage --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-http.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../evidence/2026-10-05/parallel/integrations/current-gates.json)。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项             | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| C1 初始化与依赖模式  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/setup_rxdb_http.ts:50-151 初始化/adapter/plugin注册`<br>单例RxDB显式使用wa-sqlite local、HTTP remote、SyncType.None，QueryCache/history/sync插件串联；远端用recipes映射，WASM按OPFS/SharedWorker能力建worker。未把demo行作为远端失败fallback。                                                                                                                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控app:test和冷build/E2E；服务不可达、WASM缺失、重复初始化与scope更换须单独运行。                                                    |
| C2 离线写与缓存质量  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/app.ts:210-214 useFind offlineFallback、294 useSyncState、503-517 create`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts:91-108 pending/实际by-ids对照`<br>UI本地保存、offlineFallback和库sync状态独立；现有E2E不是只看pending=0，还查服务器by-ids的id/title/price。旧HTTP/SWR历史修复不重复登记。                                                                                                 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮单测/E2E结果待主控；离线增改删、拒绝不入outbox、联网推送、重开、部分缓存与完整结果分辨仍须当前真实日志。                          |
| C3 筛选、页码与 ETag | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/app.ts:158-214 page/clamp/useFind、451-460 filter/page-size重置`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/filter-rules.ts:76-98 buildFilterRules`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/paging.ts:53-62 pageCount/clampPage`<br>filter和pageSize变化重置requestedPage，页码按缓存总数clamp；查询identity含where/limit/offset，规则只生成声明的字段/操作。ETag与token来自adapter而非UI伪计数。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控快速切页/filter、空/同值游标、过滤后删除导致末页缩小、304与token旧页；当前源码静态不代替浏览器并发验证。                          |
| C4 流量与变更流安全  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/traffic-recorder.ts:105-176 CAPACITY/installTrafficRecorder/onTraffic`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http/src/app/app.ts:369-385 DestroyRef解除订阅`<br>traffic最多200条，记录method/path/status/duration，不记录headers/body；取消后恢复fetch，页面订阅有DestroyRef清理。SSE诊断和HTTP错误区分，不据日志说已同步。                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮大量流量/离开页面/失败response/敏感query URL与断流，确认所有subscriber/timer释放；file-inspection仅分段，不声称诊断每条分支已测。 |
| C5 端到端对照        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/offline-fallback.spec.ts:23-60 离线/409对照`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/src/orphan-cleanup.spec.ts:23-50 远端删→离线刷新`<br>E2E有真实HTTP错误与离线分类对照；orphan验证后端删除后页面消失并离线reload仍不存在，强于只看UI提示。CORS当前只证明允许origin，不证明拒绝。                                                                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮HTTP E2E运行待主控；恶意origin/token、候选A、对数据清理的失败路径与当前app bundle仍待补，不能以旧成功给全对象complete。           |

证据：[逐C矩阵](../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
