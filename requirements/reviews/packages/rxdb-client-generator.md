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

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

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

| 编号 | 专项                 | 核查动作                                                                                    | 最低复验场景 / 证据要求                                                                  | 状态                         |
| ---- | -------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| C1   | 输入元数据到 AST     | 从实体字段、关系、继承、泛型和插件 generator 跟踪到生成 AST，核查非法元数据拒绝位置。       | 同名符号、循环关系、可空/只读字段、numeric id、Graph/Tree repository；生成代码真实编译。 | 部分核销；见2026-10-05证据表 |
| C2   | 公开类型保真         | 对照核心与三框架 API，核查 import 路径、类型擦除与公开方法归属。                            | 现有 consumer 编译，不依赖已移除内部导出；不能用 any 或仅字符串包含断言掩盖类型失真。    | 部分核销；见2026-10-05证据表 |
| C3   | 确定性与增量         | 核查符号排序、重复生成、陈旧文件清理和产物写入；确保输入不变时结果稳定。                    | 连续生成两遍、仅改一个字段、删除实体、输出路径重叠、写入失败；无残留/半套生成物。        | 部分核销；见2026-10-05证据表 |
| C4   | CLI 与 Vite 路径基准 | 分别核查配置目录相对路径、cwd 相对路径、glob、outDir 与构建缓存输入；不得自行统一已有行为。 | 从仓库根和子目录执行、包含空格的路径、输出越界、同输入不同 cwd；错误可复验。             | 部分核销；见2026-10-05证据表 |
| C5   | Node / 浏览器边界    | 审查 ts-morph-browser、CLI/shebang 与子路径构建；浏览器入口不能静态拉入 Node 文件系统。     | 浏览器页面真实生成、Node CLI 运行、打包后子路径导入、离线运行；可选能力按需加载。        | 部分核销；见2026-10-05证据表 |
| C6   | 样例与发布契约       | 将 README 样例、公开 API baseline 和实际 pack 文件逐一对照，检查插件 generator 的导出闭合。 | 样例在工作区跑通，生成客户端被真实应用消费；源码里存在的符号不等于 npm 子入口可用。      | 部分核销；见2026-10-05证据表 |

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

[本对象实际意见与复验证据](../results/packages/rxdb-client-generator.md) · 本批台账。只核销明确运行面；Node harness 不冒充真实小程序档位。

## 2026-10-05：parallel/core 核销对照

本轮已实际审查与验证，未改原最低复验标准。**原完整C核销0，原完成条件不勾；execution保持in-progress，执行记录保持partial。** “部分核销”仅表示下表中有证据的子面，不把单测红等同未评审，也不把发现一个问题等同完整C。

| C   | 本轮实际审查所得 / 源码锚点                                                                                                                                                                                                                                                               | 验证面                                                                                                                   | 核销结论                                     | 必要待证 / 下一批动作                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| C1  | `packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts:82-83,111-178,276-306,403-415,445-475`：元数据键是 JSON 元组；标识符、同名实体、barrel 碰撞、getter 冲突在发布 project 前校验；many-to-many 对端必须指回本端。                                                            | 本轮 374 passed/2 failed；glob 两红来自新 spec，不否定其它已通过场景；元数据→AST 主类全文审读。                          | 部分核销：输入拒绝和项目替换边界。           | analyze-file、完整 AST renderer、关系/规则/继承/泛型生成叶子及对应测试未全读；未完整核销所有 C1 最低场景。   |
| C2  | `packages/rxdb-client-generator/src/generators/entity-properties.ts:94-119`：计算属性不进 InitData；readonly 传到声明；split augmentation 使用 typeof import，sibling import 为 type-only；不会仅靠字符串 export 声称类型等价。                                                           | 统一69对象 typecheck包含消费者/依赖构建；已读生成属性和主类，不把整个 typecheck 当作生成类型所有负例的证明。             | 部分核销：已读的字段和 split 类型出口。      | 规则/关系/Repository 公开方法及 TS 负例未逐一审；三框架真实消费/现有 API 对照未完整核销。                    |
| C3  | `packages/rxdb-client-generator/src/cli/build-client-lib.ts:44-53,80-185,258-305`：输出词法 containment、manifest 去重、stale 软链拒绝、先校验/后 staging/manifest 最后提交；RV-049 最近存在祖先 realpath 的修法已读。单文件 rename 原子不等于整套提交事务，源码已承认提交中途 I/O 风险。 | 实现全文已读；当前对应旧 spec 被执行，未把 2026-10-04 38 files/371 passed 当本轮。                                       | 部分核销：已追 RV-049 修法与写入安全边界。   | 新 alias 回归全文/两次生成+删实体+I/O 拒绝全验证面未读全；跨进程/提交段半套风险不能以队列或 staging 绿抹掉。 |
| C4  | `packages/rxdb-client-generator/src/cli/cli.ts:28-109` CLI 按配置目录归一；`packages/rxdb-client-generator/src/plugins/vite.ts:74-85,102-140` 明确保留宿主 cwd 锚点，串行重建并报告错误。find-files 只判断 * / ?，字符类/花括号失败（候选2）。                                            | cli.spec.ts 和真实 Vite integration spec 全文已读；本轮 glob 2 failed/1 passed；星号正常，不能把所有 glob 判坏。         | 部分核销：两种路径基准和 glob 失败面已确认。 | 含空格/从不同 cwd 的全部最小复验与 repository-generators 测试正文未核完；因此不擅自勾完整 C4。               |
| C5  | `packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts:1-32,403-425`：内存生成器不写盘；Node fs 在 CLI/Vite 写盘端，不能因为根入口提到 CLI 就猜浏览器必静态引 fs。                                                                                                               | 构建/typecheck本轮有证据；当前 tests environment=node，真实 Vite integration 是 Node 调构建/服务器，不是浏览器页面生成。 | 部分核销：内存/文件系统职责边界。            | ts-morph-browser 全文、根导出递归闭合、离线真实页面、打包 CLI/bin/子路径 consumer 未完整核销。               |
| C6  | `packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts:725-747`：split barrel 仅 re-export，避免 TS2459；`packages/rxdb-client-generator/src/plugins/vite.ts:93-98` 首次解析前生成。                                                                                             | 本轮真实 Vite build/import 和连续改字段测试通过；这是工作区集成，不是实际 pack 的全部子路径承诺。                        | 部分核销：首次生成消费和 split 出口。        | README、API baseline、pack 文件和插件 generator 导出全集未逐条对照；失败轮没有本轮完整四指标报告。           |

本轮验证的日期/基线、测试红绿、coverage测量面与晚加spec边界见 [本对象实际执行记录](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-client-generator.md)。继续动作只限上表的必要缺口；本次不新增探针/发现，不等待主控重队列，supplement最终结果由主控追加。
