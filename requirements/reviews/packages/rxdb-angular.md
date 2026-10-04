---
kind: review-plan
object: rxdb-angular
source_root: packages/rxdb-angular
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-angular：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Angular：核心查询资源、provider、状态/action/同步与无限滚动的框架封装。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-angular`](../../../packages/rxdb-angular)                    |
| Nx 项目             | `rxdb-angular`                                                               |
| npm 名称            | `@aiao/rxdb-angular`                                                         |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W4 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 36 个；测试/共享套件入口 13 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/hooks.ts`](../../../packages/rxdb-angular/src/hooks.ts)
- [`src/rxdb.provider.ts`](../../../packages/rxdb-angular/src/rxdb.provider.ts)
- [`src/use-action.ts`](../../../packages/rxdb-angular/src/use-action.ts)
- [`src/use-infinite-scroll.ts`](../../../packages/rxdb-angular/src/use-infinite-scroll.ts)
- [`src/use-sync-state.ts`](../../../packages/rxdb-angular/src/use-sync-state.ts)
- [`README.md`](../../../packages/rxdb-angular/README.md)
- [`package.json`](../../../packages/rxdb-angular/package.json)
- [`project.json`](../../../packages/rxdb-angular/project.json)
- [`src/index.ts`](../../../packages/rxdb-angular/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-angular/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-angular/tsconfig.json)

公共边界：

- 源 `package.json` 未声明 `exports`；继续追踪构建/打包生成的入口与声明，不能直接认定没有公开 API。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-angular.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: *`、`@aiao/rxdb-plugin-graph: *`、`@aiao/utils: *`、`@angular/core: 22.1.6`、`@angular/platform-browser: 22.1.6`、`ngxtension: ^7.0.1`、`rxjs: ^7.8.2`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                                                                                       | 最低复验场景 / 证据要求                                                                          | 状态   |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| C1   | 查询资源状态机         | 逐个公开 useGet/useFind/useFindOne 等入口核对 value/error/isLoading/isEmpty/hasValue、默认值与查询键切换；与核心 repository 事件对照。         | 首次加载、空结果、失败后重试、参数快速变化、过期响应；五项资源状态三端一致。                     | 待核查 |
| C2   | 写操作、实体与同步     | 追踪 action 防重入、entity change、sync state/persisted state 到核心实现；错误不只 console 输出。                                              | 连续点击、写入拒绝、换库、离线重连、组件销毁；错误/返回值按既有 API 传达。                       | 待核查 |
| C3   | 无限滚动与类型对称     | 核查分页边界、并发 loadMore、滚动 observer 清理和实体泛型；使用同一 shared fixtures 对照另外两端。                                             | 末页、排序同值、可空列、删除/更新跨页、多个列表；不重复加载或丢行，consumer 类型保真。           | 待核查 |
| C4   | Angular 生命周期与注入 | 核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。 | 切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。              | 待核查 |
| C5   | Angular 类型与运行证据 | 核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。                                                          | typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。 | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **13** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/hooks.spec.ts`](../../../packages/rxdb-angular/src/__tests__/hooks.spec.ts)
- [`src/__tests__/rxdb.provider.spec.ts`](../../../packages/rxdb-angular/src/__tests__/rxdb.provider.spec.ts)
- [`src/__tests__/tri-framework-provider.spec.ts`](../../../packages/rxdb-angular/src/__tests__/tri-framework-provider.spec.ts)
- [`src/__tests__/use-action.spec.ts`](../../../packages/rxdb-angular/src/__tests__/use-action.spec.ts)
- [`src/__tests__/use-sync-state.spec.ts`](../../../packages/rxdb-angular/src/__tests__/use-sync-state.spec.ts)
- [`src/__tests__/InfiniteScrollingList.spec.ts`](../../../packages/rxdb-angular/src/__tests__/InfiniteScrollingList.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-angular/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **90%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-graph`](rxdb-plugin-graph.md)、[`rxdb-test`](rxdb-test.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`angular-todo`（集成边界）](../../../modules/angular-todo)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`rxdb-model-angular`](rxdb-model-angular.md)、[`rxdb-plugin-tree-angular`](rxdb-plugin-tree-angular.md)、[`rxdb-plugin-working-tree-angular`](rxdb-plugin-working-tree-angular.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**RxDB 基础封装联审**：[`rxdb`](rxdb.md)、[`rxdb-react`](rxdb-react.md)、[`rxdb-vue`](rxdb-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：需当前框架的实际 test 配置；模拟 DOM 的组件测试与真实 browser/application 复验分别记录。

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
NX_DAEMON=false pnpm nx show project rxdb-angular --json
CI=true NX_DAEMON=false pnpm nx run rxdb-angular:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-angular --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-angular:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-angular
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-angular.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 续执行：2026-10-03 边界取证

本批实际源码专题、确认意见和复验结果见 [此对象执行记录](../results/packages/rxdb-angular.md) 与 [续执行汇总](../follow-up-2026-10-03.md)。只核销记录中明确覆盖的 C 项，不把全量门禁或单用例通过当作全对象评审完成。
