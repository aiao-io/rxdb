---
kind: review-plan
object: dev-rxdb-http-server
source_root: apps/dev-rxdb-http-server
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: not-started
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
| 执行状态            | 未开始正式评审；业务门禁未执行、覆盖率未测量                                 |

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

| 编号 | 专项                      | 核查动作                                                                                               | 最低复验场景 / 证据要求                                                                   | 状态   |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------ |
| C1   | 请求与数据边界            | 从路由解析到 repository 审查请求 schema、方法、字段白名单、规则与 SQL 参数化。                         | 畸形 JSON、未知实体/字段、超大 body、注入条件、4xx/5xx；失败不写库。                      | 待核查 |
| C2   | 鉴权、CORS 与控制接口     | 核查 demo control/seed/reset、origin/credentials、监听地址和部署假设，明确演示服务不等于生产安全模板。 | 未经授权 origin、公开 reset/control、跨 scope、日志凭证；危险入口受已声明边界约束。       | 待核查 |
| C3   | ETag / token 完整性       | 检查 token 的作用域、过滤/排序绑定、有效期与条件请求缓存语义。                                         | 篡改 token、旧筛选 token、跨 entity token、304/412、分页中更新；不接受错 scope 的继续页。 | 待核查 |
| C4   | 变更流与资源              | 审查 broadcaster/subscribers、重连 cursor、慢消费者和断开清理。                                        | 长连接退出、突发事件、慢客户端、未知 cursor、服务停止；有限缓冲，无孤儿订阅。             | 待核查 |
| C5   | 数据事务与进程生命周期    | 核查 rxdb-store、批写、seed/reset 的隔离、关库和错误映射。                                             | 中途失败、服务重启、并发写、重复操作、磁盘错误；旧数据不被意外清空。                      | 待核查 |
| C6   | client-server conformance | 与 rxdb-adapter-http/reference server 和配套 E2E 逐请求对照；不能两边共用同一个错误假设。              | 真实客户端离线/在线链路、条件请求、分页、变更流、部分失败；抓包与 DB 状态共同证明。       | 待核查 |

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
- [ ] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。
