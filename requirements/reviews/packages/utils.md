---
kind: review-plan
object: utils
source_root: packages/utils
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: not-started
---

# utils：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

供整个工作区复用的类型、异步、生命周期、浏览器存储、文件和数据工具。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/utils`](../../../packages/utils)                                  |
| Nx 项目             | `utils`                                                                      |
| npm 名称            | `@aiao/utils`                                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W0 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 284 个；测试/共享套件入口 117 个（按文件名，不代表覆盖率）                   |
| 执行状态            | 未开始正式评审；业务门禁未执行、覆盖率未测量                                 |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/index.ts`](../../../packages/utils/src/index.ts)
- [`src/async/AsyncQueueExecutor.ts`](../../../packages/utils/src/async/AsyncQueueExecutor.ts)
- [`src/lifecycle/lifecycle-scope.ts`](../../../packages/utils/src/lifecycle/lifecycle-scope.ts)
- [`src/@browser/broadcast-channel-pool.ts`](../../../packages/utils/src/@browser/broadcast-channel-pool.ts)
- [`src/object/createQueryOptionsKey.ts`](../../../packages/utils/src/object/createQueryOptionsKey.ts)
- [`src/indexing/fractional-indexing.ts`](../../../packages/utils/src/indexing/fractional-indexing.ts)
- [`README.md`](../../../packages/utils/README.md)
- [`package.json`](../../../packages/utils/package.json)
- [`project.json`](../../../packages/utils/project.json)
- [`tsconfig.lib.json`](../../../packages/utils/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/utils/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/utils.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项               | 核查动作                                                                                                         | 最低复验场景 / 证据要求                                                                           | 状态   |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| C1   | 全功能域清点       | 按 src/index.ts 的每个 barrel 逐个核查，不只看被当前应用调用的工具；检查包根导入是否触碰浏览器全局或制造副作用。 | Node consumer、浏览器 consumer、单子入口导入、tree-shaking；所有导出有明确环境与类型边界。        | 待核查 |
| C2   | 队列与资源生命周期 | 审查异步队列、取消、超时、scope cleanup 的错误传播和幂等性；检查队列中的失败是否拖死后续任务。                   | 任务拒绝、关闭中排队、重复 dispose、任务内重新入队、取消后完成；无悬挂 Promise 或重复释放。       | 待核查 |
| C3   | 跨标签页与持久化   | 核查广播池、leader election、持久状态与 OPFS 路由同步的身份隔离和清理。                                          | 同名库不同 scope、leader 退出、消息乱序、存储被拒、页面卸载；不把不支持的环境静默视为持久化成功。 | 待核查 |
| C4   | 对象与稳定键       | 检查深拷贝、对象路径、查询键序列化、相等判定和输入修改；明确不支持的数据形态，防止原型污染。                     | 循环引用、BigInt、Date、Uint8Array、undefined、键顺序、**proto** 路径；键碰撞和共享引用有实证。   | 待核查 |
| C5   | 数值、文本与排序   | 检查数值转换、日期、中文/Unicode、分数索引的精度与边界，避免把便利转换当作验证。                                 | NaN/Infinity、超安全整数、时区/闰日、代理对、重复边界键、连续插入；行为与现有契约一致。           | 待核查 |
| C6   | 文件、编码与随机性 | 逐项核查 file/binary/crypto/random 工具的能力声明和调用者；区分普通随机与安全随机。                              | 空二进制、巨型输入、坏编码、路径穿越、缺安全随机源；错误透明，不回退到不安全随机源。              | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **117** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/@browser/broadcast-channel-pool.spec.ts`](../../../packages/utils/src/__tests__/@browser/broadcast-channel-pool.spec.ts)
- [`src/__tests__/async/AsyncQueueExecutor.spec.ts`](../../../packages/utils/src/__tests__/async/AsyncQueueExecutor.spec.ts)
- [`src/__tests__/indexing/fractional-indexing.spec.ts`](../../../packages/utils/src/__tests__/indexing/fractional-indexing.spec.ts)
- [`src/__tests__/lifecycle/lifecycle-scope.spec.ts`](../../../packages/utils/src/__tests__/lifecycle/lifecycle-scope.spec.ts)
- [`src/__tests__/object/createQueryOptionsKey.spec.ts`](../../../packages/utils/src/__tests__/object/createQueryOptionsKey.spec.ts)
- [`src/__tests__/@browser/IdleTimer.spec.ts`](../../../packages/utils/src/__tests__/@browser/IdleTimer.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/utils/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：未记录。

Nx 基线图中的直接消费者：[`angular-todo`（集成边界）](../../../modules/angular-todo)、[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb`](rxdb.md)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-angular`](rxdb-angular.md)、[`rxdb-client-generator`](rxdb-client-generator.md)、[`rxdb-plugin-graph`](rxdb-plugin-graph.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-replay`](rxdb-plugin-replay.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)、[`rxdb-plugin-storage`](rxdb-plugin-storage.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-plugin-workspace`](rxdb-plugin-workspace.md)、[`rxdb-react`](rxdb-react.md)、[`rxdb-vue`](rxdb-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

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
NX_DAEMON=false pnpm nx show project utils --json
CI=true NX_DAEMON=false pnpm nx run utils:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=utils --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run utils:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=utils
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
