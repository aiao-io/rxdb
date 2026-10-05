---
kind: review-plan
object: dev-rxdb-http-server
source_root: apps/dev-rxdb-http-server
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-http-server：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

隔离 HTTP 演示服务端，承载 RuleGroup 查询、ETag、分页 token、SSE/变更流和本地数据存储。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-http-server`](../../../apps/dev-rxdb-http-server)            |
| Nx 项目             | `dev-rxdb-http-server`                                                       |
| npm 名称            | `@aiao/dev-rxdb-http-server`                                                 |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 25 个；测试/共享套件入口 4 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：本批仅部分专题复核，完整门禁/覆盖率未完成                            |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/server.ts`](../../../apps/dev-rxdb-http-server/src/server.ts)
- [`src/recipes-repository.ts`](../../../apps/dev-rxdb-http-server/src/recipes-repository.ts)
- [`src/page-token.ts`](../../../apps/dev-rxdb-http-server/src/page-token.ts)
- [`src/change-feed.ts`](../../../apps/dev-rxdb-http-server/src/change-feed.ts)
- [`src/cors.ts`](../../../apps/dev-rxdb-http-server/src/cors.ts)
- [`src/rxdb-store.ts`](../../../apps/dev-rxdb-http-server/src/rxdb-store.ts)
- [`README.md`](../../../apps/dev-rxdb-http-server/README.md)
- [`package.json`](../../../apps/dev-rxdb-http-server/package.json)
- [`project.json`](../../../apps/dev-rxdb-http-server/project.json)
- [`tsconfig.app.json`](../../../apps/dev-rxdb-http-server/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-http-server/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                      | 核查动作                                                                                               | 最低复验场景 / 证据要求                                                                   | 状态                          |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------- |
| C1   | 请求与数据边界            | 从路由解析到 repository 审查请求 schema、方法、字段白名单、规则与 SQL 参数化。                         | 畸形 JSON、未知实体/字段、超大 body、注入条件、4xx/5xx；失败不写库。                      | 部分核查；见2026-10-05逐C结论 |
| C2   | 鉴权、CORS 与控制接口     | 核查 demo control/seed/reset、origin/credentials、监听地址和部署假设，明确演示服务不等于生产安全模板。 | 未经授权 origin、公开 reset/control、跨 scope、日志凭证；危险入口受已声明边界约束。       | 部分核查；见2026-10-05逐C结论 |
| C3   | ETag / token 完整性       | 检查 token 的作用域、过滤/排序绑定、有效期与条件请求缓存语义。                                         | 篡改 token、旧筛选 token、跨 entity token、304/412、分页中更新；不接受错 scope 的继续页。 | 部分核查；见2026-10-05逐C结论 |
| C4   | 变更流与资源              | 审查 broadcaster/subscribers、重连 cursor、慢消费者和断开清理。                                        | 长连接退出、突发事件、慢客户端、未知 cursor、服务停止；有限缓冲，无孤儿订阅。             | 部分核查；见2026-10-05逐C结论 |
| C5   | 数据事务与进程生命周期    | 核查 rxdb-store、批写、seed/reset 的隔离、关库和错误映射。                                             | 中途失败、服务重启、并发写、重复操作、磁盘错误；旧数据不被意外清空。                      | 部分核查；见2026-10-05逐C结论 |
| C6   | client-server conformance | 与 rxdb-adapter-http/reference server 和配套 E2E 逐请求对照；不能两边共用同一个错误假设。              | 真实客户端离线/在线链路、条件请求、分页、变更流、部分失败；抓包与 DB 状态共同证明。       | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **4** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/change-feed.spec.ts`](../../../apps/dev-rxdb-http-server/src/__tests__/change-feed.spec.ts)
- [`src/__tests__/rxdb-store.spec.ts`](../../../apps/dev-rxdb-http-server/src/__tests__/rxdb-store.spec.ts)
- [`src/__tests__/error-mapping.spec.ts`](../../../apps/dev-rxdb-http-server/src/__tests__/error-mapping.spec.ts)
- [`src/__tests__/server.spec.ts`](../../../apps/dev-rxdb-http-server/src/__tests__/server.spec.ts)

运行配置：[`vite.config.mts`](../../../apps/dev-rxdb-http-server/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`recipes-domain`（集成边界）](../../../modules/recipes-domain)、[`rxdb`](../packages/rxdb.md)、[`rxdb-adapter-pglite`](../packages/rxdb-adapter-pglite.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-http-e2e`](dev-rxdb-http-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-http`](dev-rxdb-http.md)、[`dev-rxdb-http-e2e`](dev-rxdb-http-e2e.md)、[`rxdb-adapter-http`](../packages/rxdb-adapter-http.md)。

## 5. 执行命令与环境

前置环境：Node 26+ 与隔离演示 DB/端口；seed/reset 是破坏性操作，只允许专用测试目录，禁止生产数据。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                         |
| ----------- | ---------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-http-server --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-http-server:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test --projects=dev-rxdb-http-server --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-http-server:test --coverage --skipRemoteCache --skipNxCache
```

- 本项目没有 `build` target；不可臆造构建门禁。`seed` / `reset` 有数据副作用，先确认隔离库与现有语义，本计划不默认执行。

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

[已执行范围、实际评审意见与证据](../results/apps/dev-rxdb-http-server.md)；[全仓执行台账](../execution-2026-10-03.md)。

真实 Nx serve＋隔离文件 PGlite 目录＋回环端口。正常查询 200、超限 body 413 两条路径通过；null/数组 metadata 及非法 request-target 各有实际请求证据。未执行全套端点测试、SSE/备份/分页并发或生产部署审查。

只有上述范围取得本轮证据，未执行项仍待核查，完成清单不勾选。

### 2026-10-04 第六批：真实后端联审

[原应用/PGlite + HTTP + 文件 SQLite 的实际取证](../execution-2026-10-04-sync-http-sqlite.md)。新增 RV-055，RV-052/053/054 补真实后端证据；scope、缓存收敛和配置适用性已分别写入独立执行记录，不给未测 GUI/CORS/Supabase/发布消费通过结论。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../evidence/2026-10-05/parallel/integrations/current-gates.json)。

**晚于门禁快照新增的探针**：`src/__tests__/review-parallel-change-broadcast-origin.spec.ts` 未运行，也未继承上述lint/typecheck；已列验证请求交主控分流。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                     | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 请求与数据边界            | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/http-utils.ts:34-52 readJsonBody`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:324-338 URL错误、400-409 decodeSegments`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/recipes-repository.ts:330-373 readObject/readIdList/readWritablePatch`<br>body限制1MiB、对象形状/IDs/可写字段显式检查；非法URL与percent escape返回400，不让异步handler裸崩。规则深度检查后交上游查询编译，未另造fallback。         | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮server:test运行结果由主控后补；需空body/数组/null、畸形target、未知field/RuleGroup注入、巨大body与错误数字，拒绝后数据库不变。         |
| C2 鉴权、CORS 与控制接口     | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:94-100 assertAuthorized、370-380 dispatch、411-434 runControl`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/cors.ts:52-95 origin/preflight`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/main.ts:49 runServe`<br>这是loopback demo：无Authorization放行，有header只验Bearer形状；控制接口在NODE_ENV非production开启且在offline闸门之前；origin回显、OPTIONS在鉴权前。不是生产Auth/CORS拒绝实现。        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 补production控制接口404、错误Bearer/no-body副作用及可信测试origin对照；未授权origin/真实身份拒绝需要受控生产式server，不可用demo成功核销。 |
| C3 ETag / token 完整性       | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:117-147 sendConditional/handleMetadata`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/http-utils.ts:63 computeEtag、94-98 matchesIfNoneMatch`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/page-token.ts:54-97 encode/decodePageToken`<br>ETag由完整响应JSON的SHA256生成；支持weak/list/*匹配。token校验非空string及a/w tuple结构，载荷base64url并非MAC或filter身份绑定。对token完整性不给越权安全结论。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实条件请求、内容更新后200、篡改token/旧filter/同值排序/分页删除；只有合法静态250行翻页对照，不能覆盖全部恶意token。                  |
| C4 变更流与资源              | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/change-feed.ts:34-57 openChangeFeed`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/change-subscribers.ts:29-54 createChangeSubscribers`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/change-broadcaster.ts:47-74 recordWrite/onEntityEvent`<br>SSE response close删订阅、request close清心跳，closeAll收束。广播按实体事件派发，但合批归最后clientId为静态候选A；并非本轮已复现缺陷。                              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控新增review-parallel-change-broadcast-origin.spec.ts与真实PGlite/双client SSE时序；断线、慢消费者、结束后订阅/timer归零仍需动态。       |
| C5 数据事务与进程生命周期    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/rxdb-store.ts:51-73 createRxdbRecipeStore`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:253-282 reseed/close`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/main.ts:53-57 信号清理`<br>数据层使用真实RxDB/PGlite文件而非旧node:sqlite demo；reset先destroy再换库，body await后现取store避免已释放句柄；停机先关SSE再server/store。                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控test中验证并发reset/请求、提交失败、信号退出、重开持久化与clear/reset不同语义；本轮没有启动进程，不判进程收束通过。                    |
| C6 client-server conformance | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/server.ts:170-230 routeProtocol`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-server/src/recipes-repository.ts:111-125 listMetadataByOffset、308-320 deleteRecipes`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-http-e2e/playwright.config.ts:61-75 双服务`<br>逐项对照metadata/by-ids/create/update/delete和变更流；应用server与客户端协议路径可追溯，E2E依赖冷前端build及后端build-deps而非旧产物。                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 本轮server整包、HTTP adapter wire、本轮E2E由主控后补；协议fixture/mock不能代替真实应用server的响应与数据库状态。                           |

证据：[逐C矩阵](../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
