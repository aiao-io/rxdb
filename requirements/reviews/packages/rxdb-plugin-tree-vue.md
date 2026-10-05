---
kind: review-plan
object: rxdb-plugin-tree-vue
source_root: packages/rxdb-plugin-tree-vue
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-plugin-tree-vue：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Vue：Tree repository 的响应式查询与加载状态封装。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-tree-vue`](../../../packages/rxdb-plugin-tree-vue)    |
| Nx 项目             | `rxdb-plugin-tree-vue`                                                       |
| npm 名称            | `@aiao/rxdb-plugin-tree-vue`                                                 |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W4 / 中（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 13 个；测试/共享套件入口 3 个（按文件名，不代表覆盖率）                      |
| 执行状态            | R2-04：13/13 已全读；原 C 动态补证由主控串行核销                             |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/use-tree.ts`](../../../packages/rxdb-plugin-tree-vue/src/use-tree.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-tree-vue/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-tree-vue/README.md)
- [`package.json`](../../../packages/rxdb-plugin-tree-vue/package.json)
- [`project.json`](../../../packages/rxdb-plugin-tree-vue/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-tree-vue/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-tree-vue/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-tree-vue.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: *`、`@aiao/rxdb-plugin-tree: *`、`@aiao/rxdb-vue: *`、`rxjs: ^7.8.2`、`vue: ^3.5.42`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号                                                                                                                                                                                                                                                 | 专项                     | 核查动作                                                                                                                  | 最低复验场景 / 证据要求                                                                                  | 状态    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| C1                                                                                                                                                                                                                                                   | 树查询与输入类型         | 对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。                               | numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。               | partial |
| C2                                                                                                                                                                                                                                                   | 增量结果与参数切换       | 核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。                                                  | 跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。                                           | partial |
| C3                                                                                                                                                                                                                                                   | 三端 contract 与泄漏     | 逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。                                                  | 同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。                       | partial |
| C4                                                                                                                                                                                                                                                   | Vue 生命周期与响应式来源 | 核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。 | 替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。                             | partial |
| C5                                                                                                                                                                                                                                                   | Vue 类型与 SFC 消费      | 核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。                                   | vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。 | partial |
| 共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。 |

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **3** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/use-tree.spec.ts`](../../../packages/rxdb-plugin-tree-vue/src/__tests__/use-tree.spec.ts)
- [`src/__tests__/index.spec.ts`](../../../packages/rxdb-plugin-tree-vue/src/__tests__/index.spec.ts)
- [`src/__tests__/tri-framework-generics.spec.ts`](../../../packages/rxdb-plugin-tree-vue/src/__tests__/tri-framework-generics.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-tree-vue/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；2026-10-05 主控原 wrapper 测量均100%，新 spec 待复跑。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-vue`](rxdb-vue.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**树联审**：[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-plugin-tree-angular`](rxdb-plugin-tree-angular.md)、[`rxdb-plugin-tree-react`](rxdb-plugin-tree-react.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-tree-vue --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-tree-vue:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-tree-vue --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-tree-vue:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-tree-vue
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [x] 全部 13 个原受控文件清点及正文阅读；范围外导航未充当已读。
- [x] C1–C5 原动作/最低场景逐项保留，区分已证、prepared-not-run、未验证及补证动作。
- [x] 不变量有生产锚点；主控原测量与新探针准备状态分开，不预判新探针通过/失败。
- [x] 主控原 build/lint/test 命令、串行/禁缓存、原5tests无skip与四指标/测量面已登记；新spec尚未跑。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [x] 本轮未新增本包候选；只读去重 registry，未测 core branch 明确留待证。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-tree-vue.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 R2-04 有界收口

**正文 13/13 已读，C1–C5 每项已明确落盘；0/5 完整原 C，5/5 partial。** 唯一对象本包，主控已有测量在 `76a3848e2086f4617b80f7b1a1b896ef76e5719c`；新补证未运行，因此不标全对象完成候选、不标发布就绪。第一轮“5正文/8未读”已被本次13份全文阅读覆盖；未删原场景。

| C                           | 本次已完成的阅读/已有证据                                                                                    | 必要待证（不虚标）                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| C1 树查询与输入类型         | 原测试四hooks各派发同名静态仓储方法；原类型fixture只含string id树实体/PlainEntity正反例                      | numeric/string id实际TreeRepository查询；未注册Tree插件的实际仓储链路（区别于缺方法mock）；QueryCache禁止组合；深树/lazy/层级SQL结果 |
| C2 增量结果与参数切换       | 订阅责任在useRepositoryQuery，不把旧value消失当不变量：重查保留stale value，hasValue=false/isEmpty=undefined | 真实跨父移动；真实父删除；真实空树与全量树查询结果一致；上述core变更的当前branch回归                                                 |
| C3 三端 contract 与泄漏     | 三端实际index/use-tree局部对照；命名本仓库均为use，不按通用inject约定误报Angular                             | 同一真实tree fixture三端运行与状态对照；三端真实仓储多实例泄漏对照；tar声明consumer当前正反编译                                      |
| C4 Vue 生命周期与响应式来源 | 旧测试运行的确实是Vue effectScope，不是mock useRepositoryQuery                                               | 新Vue scope与组件probe的实际执行/类型检查；真实RxDB provider/Tree初始化接线由C1仓储链路补证或主控明确归属，不虚标执行                |
| C5 Vue 类型与 SFC 消费      | 真实tar与当前dist/index.js、index.d.ts、use-tree.d.ts字节一致；这是产物映射，不是重复构建确定性              | 独立tar strict/skipLibCheck=false正反.mts编译；独立tar vue-tsc有效/无效模板及emit契约；新spec实体identity运行断言                    |

### 今日最小补证与主控分工

- 新增 [review-round2-vue-scope.spec.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/__tests__/review-round2-vue-scope.spec.ts)：30 个计划用例，四 hooks × 五响应式来源、参数换代、error/empty、真实 Vue 多 scope/组件 props 与卸载，**待主控执行**；mock 静态仓储不冒充真树 SQL。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/valid.mts` / `invalid.mts` 已尽早落盘：公开包 imports、FindTreeOptions、numeric/string 与四 hooks；正反分离、无 paths/any/expect-error。node/@types/ms 环境为主控已有环境，不改依赖。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/valid.vue` / `invalid.vue`：vue-tsc 正反模板/props/emits/readonly/computed fixture，主控独立 tar consumer 执行。
- 主控原3spec/5tests通过，build/lint通过，四指标100/100/100/100（8 statements、4 functions、0 branches）。真实 tar root runtime import exit0。上述绿**不继承新spec或typed/SFC consumer**。
- 原 tree core 真实 branch / QueryCache / 深树 / 移动删除 / 全量一致性、三端同一真实 fixture仍待主控明确复用证据或裁定；不改原 C 为不适用，不在本任务扩新bug/实现。

### 交付与状态

本地有界交付完成（阅读、C映射、最小补证、plan/result/closure）；原完整 C 与发布门禁仍 partial。详见 [rxdb-plugin-tree-vue.md](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-tree-vue.md)、[closure.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/closure.json) 和 [validation-requests.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/validation-requests.json)。不等待其他包，不执行重任务、不派agent、未改实现/旧tests/依赖/全局index。

### R2-04 最终冻结交接

2026-10-05，冻结时间 `2026-10-05T11:35:02.083260+08:00`。30用例新spec与5份补证文件（spec、typed正反、SFC正反）已冻结，SHA见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/validation-requests.json` / `closure.json`。本代理结束有界交付，不继续读core/backend或扩任务；主控串行运行冻结输入。原移动/删除/全量一致性、参数实际换代与strict消费者不得无证标过。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
