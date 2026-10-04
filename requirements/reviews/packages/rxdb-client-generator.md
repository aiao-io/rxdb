---
kind: review-plan
object: rxdb-client-generator
source_root: packages/rxdb-client-generator
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-client-generator：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

从实体与插件元数据生成类型安全客户端、repository 和规则；含 CLI、浏览器 AST 与构建插件。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-client-generator`](../../../packages/rxdb-client-generator)  |
| Nx 项目             | `rxdb-client-generator`                                                      |
| npm 名称            | `@aiao/rxdb-client-generator`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W0 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 76 个；测试/共享套件入口 38 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/core/RxDBClientGenerator.ts`](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts)
- [`src/core/generated-symbols.ts`](../../../packages/rxdb-client-generator/src/core/generated-symbols.ts)
- [`src/cli/cli.ts`](../../../packages/rxdb-client-generator/src/cli/cli.ts)
- [`src/cli/cli.interface.ts`](../../../packages/rxdb-client-generator/src/cli/cli.interface.ts)
- [`src/cli/out-dir.ts`](../../../packages/rxdb-client-generator/src/cli/out-dir.ts)
- [`src/generators/entity-rules.ts`](../../../packages/rxdb-client-generator/src/generators/entity-rules.ts)
- [`README.md`](../../../packages/rxdb-client-generator/README.md)
- [`package.json`](../../../packages/rxdb-client-generator/package.json)
- [`project.json`](../../../packages/rxdb-client-generator/project.json)
- [`src/index.ts`](../../../packages/rxdb-client-generator/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-client-generator/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-client-generator/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./cli`、`./testing`、`./vite`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-client-generator.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项                 | 核查动作                                                                                    | 最低复验场景 / 证据要求                                                                  | 状态                      |
| ---- | -------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| C1   | 输入元数据到 AST     | 从实体字段、关系、继承、泛型和插件 generator 跟踪到生成 AST，核查非法元数据拒绝位置。       | 同名符号、循环关系、可空/只读字段、numeric id、Graph/Tree repository；生成代码真实编译。 | 待核查                    |
| C2   | 公开类型保真         | 对照核心与三框架 API，核查 import 路径、类型擦除与公开方法归属。                            | 现有 consumer 编译，不依赖已移除内部导出；不能用 any 或仅字符串包含断言掩盖类型失真。    | 待核查                    |
| C3   | 确定性与增量         | 核查符号排序、重复生成、陈旧文件清理和产物写入；确保输入不变时结果稳定。                    | 连续生成两遍、仅改一个字段、删除实体、输出路径重叠、写入失败；无残留/半套生成物。        | 部分执行，队列身份 RV-049 |
| C4   | CLI 与 Vite 路径基准 | 分别核查配置目录相对路径、cwd 相对路径、glob、outDir 与构建缓存输入；不得自行统一已有行为。 | 从仓库根和子目录执行、包含空格的路径、输出越界、同输入不同 cwd；错误可复验。             | 待核查                    |
| C5   | Node / 浏览器边界    | 审查 ts-morph-browser、CLI/shebang 与子路径构建；浏览器入口不能静态拉入 Node 文件系统。     | 浏览器页面真实生成、Node CLI 运行、打包后子路径导入、离线运行；可选能力按需加载。        | 待核查                    |
| C6   | 样例与发布契约       | 将 README 样例、公开 API baseline 和实际 pack 文件逐一对照，检查插件 generator 的导出闭合。 | 样例在工作区跑通，生成客户端被真实应用消费；源码里存在的符号不等于 npm 子入口可用。      | 待核查                    |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **38** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/RxDBClientGenerator.utils.spec.ts`](../../../packages/rxdb-client-generator/src/__tests__/RxDBClientGenerator.utils.spec.ts)
- [`src/__tests__/cli/repository-generators.spec.ts`](../../../packages/rxdb-client-generator/src/__tests__/cli/repository-generators.spec.ts)
- [`src/__tests__/known_repository_generators.spec.ts`](../../../packages/rxdb-client-generator/src/__tests__/known_repository_generators.spec.ts)
- [`src/__tests__/api-docs.spec.ts`](../../../packages/rxdb-client-generator/src/__tests__/api-docs.spec.ts)
- [`src/__tests__/cli.empty-export.spec.ts`](../../../packages/rxdb-client-generator/src/__tests__/cli.empty-export.spec.ts)
- [`src/__tests__/cli.spec.ts`](../../../packages/rxdb-client-generator/src/__tests__/cli.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-client-generator/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-plugin-graph`](rxdb-plugin-graph.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-test`](rxdb-test.md)。

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
NX_DAEMON=false pnpm nx show project rxdb-client-generator --json
CI=true NX_DAEMON=false pnpm nx run rxdb-client-generator:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-client-generator --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-client-generator:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-client-generator
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-client-generator.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：生成器、图与小程序第四批深审

[本对象实际意见与复验证据](../results/packages/rxdb-client-generator.md) · [本批台账](../execution-2026-10-04-generator-graph-miniprogram.md)。只核销明确运行面；Node harness 不冒充真实小程序档位。
