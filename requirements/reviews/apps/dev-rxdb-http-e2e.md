---
kind: review-plan
object: dev-rxdb-http-e2e
source_root: apps/dev-rxdb-http-e2e
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-http-e2e：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

真实 HTTP client/server 链路的 Playwright：条件请求、分页、CORS、离线写与变更流。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-http-e2e`](../../../apps/dev-rxdb-http-e2e)                  |
| Nx 项目             | `dev-rxdb-http-e2e`                                                          |
| npm 名称            | `@aiao/dev-rxdb-http-e2e`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W6 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 15 个；测试/共享套件入口 8 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`playwright.config.ts`](../../../apps/dev-rxdb-http-e2e/playwright.config.ts)
- [`src/support.ts`](../../../apps/dev-rxdb-http-e2e/src/support.ts)
- [`src/local-first-writes.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts)
- [`src/conditional-requests.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts)
- [`src/page-token.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/page-token.spec.ts)
- [`src/change-feed.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/change-feed.spec.ts)
- [`package.json`](../../../apps/dev-rxdb-http-e2e/package.json)
- [`project.json`](../../../apps/dev-rxdb-http-e2e/project.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-http-e2e/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项             | 核查动作                                                                                                 | 最低复验场景 / 证据要求                                                                | 状态   |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| C1   | 双服务来源与隔离 | 核查 Playwright 启动 server/frontend 的配置、端口、build 与 DB/reset 范围，拒绝旧进程假绿。              | 冷 build、端口冲突、失败 teardown、两轮全套；前后端 SHA 和测试库明确。                 | 待核查 |
| C2   | 离线写→联网闭环  | 检查 local-first-writes 与 offline-fallback 是否真实切断请求并验证 outbox/远端状态。                     | 离线增删改、响应丢失后重试、刷新、重新联网；不丢写不重复副作用，不只看 optimistic UI。 | 待核查 |
| C3   | 分页与条件请求   | 审查 token/ETag/304/412 的抓包与结果断言。                                                               | 筛选改变后旧 token、篡改/跨 scope token、分页中增删、无缓存的 304；完整结果不漏行。    | 待核查 |
| C4   | 流与 CORS 安全   | 核查真实 SSE/变更流断线、订阅清理与 origin/credentials 拒绝，不仅 mock 响应。                            | 重连 cursor、乱序/重复事件、关闭页面、非法 origin；拒绝无写入。                        | 待核查 |
| C5   | 清理与错误断言   | 检查 clear-and-paging/orphan-cleanup 是否独立验证数据库和订阅收束，审查 skip 与 console/network errors。 | 用例失败后资源回收、服务停止、孤儿数据、异常 body；每条错误均有预期/实测。             | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **8** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/change-feed.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/change-feed.spec.ts)
- [`src/conditional-requests.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts)
- [`src/local-first-writes.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts)
- [`src/page-token.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/page-token.spec.ts)
- [`src/clear-and-paging.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/clear-and-paging.spec.ts)
- [`src/cors.spec.ts`](../../../apps/dev-rxdb-http-e2e/src/cors.spec.ts)

运行配置：[`playwright.config.ts`](../../../apps/dev-rxdb-http-e2e/playwright.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

E2E 项目不以 spec 数或场景数折算业务覆盖率；以关键用户旅程、反向场景、实际宿主/平台与 skip 明细验收。生产代码覆盖率归对应应用/包，当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`dev-rxdb-http`](dev-rxdb-http.md)、[`dev-rxdb-http-server`](dev-rxdb-http-server.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-http`](dev-rxdb-http.md)、[`rxdb-adapter-http`](../packages/rxdb-adapter-http.md)。

## 5. 执行命令与环境

前置环境：Playwright 配置管理两个隔离服务；涉及 reset/control，仅允许专用测试 DB/端口。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                     |
| ----------- | ------------------------------------------------------------------ |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `e2e`       | 当前 Playwright 全套；记录宿主、浏览器、skip、trace 与数据隔离。   |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-http-e2e --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-http-e2e:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck --projects=dev-rxdb-http-e2e --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-http-e2e:e2e --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-http-e2e.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。
