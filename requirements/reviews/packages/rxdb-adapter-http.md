---
kind: review-plan
object: rxdb-adapter-http
source_root: packages/rxdb-adapter-http
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-http：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

QueryCache 的 HTTP remote adapter：规则查询、条件缓存、分页、变更流与 transport。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-adapter-http`](../../../packages/rxdb-adapter-http)          |
| Nx 项目             | `rxdb-adapter-http`                                                          |
| npm 名称            | `@aiao/rxdb-adapter-http`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 37 个；测试/共享套件入口 13 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：本批仅部分专题复核，完整门禁/覆盖率未完成                            |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterHttp.ts`](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)
- [`src/handler-contract.ts`](../../../packages/rxdb-adapter-http/src/handler-contract.ts)
- [`src/rest.ts`](../../../packages/rxdb-adapter-http/src/rest.ts)
- [`src/transport.ts`](../../../packages/rxdb-adapter-http/src/transport.ts)
- [`src/pagination.ts`](../../../packages/rxdb-adapter-http/src/pagination.ts)
- [`src/conditional-cache.ts`](../../../packages/rxdb-adapter-http/src/conditional-cache.ts)
- [`src/change-feed.ts`](../../../packages/rxdb-adapter-http/src/change-feed.ts)
- [`README.md`](../../../packages/rxdb-adapter-http/README.md)
- [`package.json`](../../../packages/rxdb-adapter-http/package.json)
- [`project.json`](../../../packages/rxdb-adapter-http/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-http/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-http/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-http/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-http.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: workspace:*`、`rxjs: ^7.8.2`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                                             | 最低复验场景 / 证据要求                                                                    | 状态                               |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| C1   | 端到端线契约           | 逐项对照 adapter、handler-contract、reference-server 与 HTTP 应用服务端；核查 RuleGroup 和错误映射。 | 未知字段/操作、注入型条件、错误 content-type、畸形 JSON、4xx/5xx；不把失败解码为空数据。   | 部分执行；真实应用 wire /401       |
| C2   | 分页与条件请求         | 检查 opaque page token、ETag/304、过滤排序与 cache identity 的一致性。                               | 筛选改变后旧 token、分页中更新/删除、304 无缓存、错 entity/scope token；不混用缓存或漏页。 | 待核查                             |
| C3   | 变更流生命周期         | 核查 reconnect、cursor、取消、订阅者清理和失效范围，不让断流被视为已同步。                           | 断线重连、重复/乱序消息、最后订阅离开、历史 cursor 失效；明确可恢复状态。                  | 待核查                             |
| C4   | 写入与 outbox 衔接     | 追踪 bulk/chunking、条件失败和 QueryCache offline write 到 sync outbox，检查幂等和重试归属。         | 超时但服务端已写、批次部分失败、离线后联网、删除重试；不丢写、不重复副作用。               | 部分执行；联审 RV-052/055          |
| C5   | 取消与不可信响应       | 检查 AbortSignal、晚到响应、响应体大小与类型转换。                                                   | 请求参数变化、卸载取消、超大 body、错误数字/二进制；过期响应不能覆盖新状态。               | 部分执行；联审 RV-053，origin-down |
| C6   | CORS / 凭证 / 生产消费 | 审查 transport 凭证和日志边界，核查 server 配合而非只看 client 配置。                                | 未授权 origin、错误 credentials、跨 scope 请求、pack 后消费；诊断中无 token 或敏感 body。  | 待核查                             |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **13** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/RxDBAdapterHttp.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/RxDBAdapterHttp.spec.ts)
- [`src/__tests__/change-feed.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/change-feed.spec.ts)
- [`src/__tests__/conditional-cache.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/conditional-cache.spec.ts)
- [`src/__tests__/pagination.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/pagination.spec.ts)
- [`src/__tests__/rest.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/rest.spec.ts)
- [`src/__tests__/transport.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/transport.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-http/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-test`](rxdb-test.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-http`](../apps/dev-rxdb-http.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`dev-rxdb-http-e2e`](../apps/dev-rxdb-http-e2e.md)、[`dev-rxdb-http-server`](../apps/dev-rxdb-http-server.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)。

## 5. 执行命令与环境

前置环境：本地参考 HTTP 服务和真实浏览器；离线/重连需可控网络。只连接隔离测试服务，不向真实 API 写探针。

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
NX_DAEMON=false pnpm nx show project rxdb-adapter-http --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-http:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-http --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-http:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-http
```

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

## 7. 本轮实际执行记录

[已执行范围、实际评审意见与证据](../results/packages/rxdb-adapter-http.md)；[全仓执行台账](../execution-2026-10-03.md)。

仅完成上述模块的部分静态阅读。已核对“切换用户需 disconnect/connect”和“只有首个同身份查询的观测回调生效”等已明确文档化限制，未将其误报为新缺陷。没有执行该包完整网络/取消/SSE/缓存/浏览器套件，不能给整体通过结论。

只有上述范围取得本轮证据，未执行项仍待核查，完成清单不勾选。

### 2026-10-04 第六批：真实后端联审

[原应用/PGlite + HTTP + 文件 SQLite 的实际取证](../execution-2026-10-04-sync-http-sqlite.md)。新增 RV-055，RV-052/053/054 补真实后端证据；scope、缓存收敛和配置适用性已分别写入独立执行记录，不给未测 GUI/CORS/Supabase/发布消费通过结论。
