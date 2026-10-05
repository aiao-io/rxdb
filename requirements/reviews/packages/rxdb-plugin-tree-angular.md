---
kind: review-plan
object: rxdb-plugin-tree-angular
source_root: packages/rxdb-plugin-tree-angular
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
source_review: complete-original-scope
opinion_delivery: complete-original-scope
scenario_evidence: partial
release_readiness: not-claimed
---

# rxdb-plugin-tree-angular：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Angular：Tree repository 的响应式查询与加载状态封装。

| 项目                | 基线事实                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                |
| 源码范围            | [`packages/rxdb-plugin-tree-angular`](../../../packages/rxdb-plugin-tree-angular) |
| Nx 项目             | `rxdb-plugin-tree-angular`                                                        |
| npm 名称            | `@aiao/rxdb-plugin-tree-angular`                                                  |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）      |
| 建议波次 / 优先风险 | W4 / 中（排期依据，不是缺陷结论）                                                 |
| 受控文件盘点        | 16 个；测试/共享套件入口 3 个（按文件名，不代表覆盖率）                           |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                         |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/use-tree.ts`](../../../packages/rxdb-plugin-tree-angular/src/use-tree.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-tree-angular/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-tree-angular/README.md)
- [`package.json`](../../../packages/rxdb-plugin-tree-angular/package.json)
- [`project.json`](../../../packages/rxdb-plugin-tree-angular/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-tree-angular/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-tree-angular/tsconfig.json)

公共边界：

- 源 `package.json` 未声明 `exports`；继续追踪构建/打包生成的入口与声明，不能直接认定没有公开 API。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-tree-angular.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: *`、`@aiao/rxdb-angular: *`、`@aiao/rxdb-plugin-tree: *`、`@angular/core: 22.1.6`、`rxjs: ^7.8.2`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号                                                                                                                                                                                                                                                 | 专项                   | 核查动作                                                                                                                                       | 最低复验场景 / 证据要求                                                                          | 状态    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| C1                                                                                                                                                                                                                                                   | 树查询与输入类型       | 对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。                                                    | numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。       | partial |
| C2                                                                                                                                                                                                                                                   | 增量结果与参数切换     | 核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。                                                                       | 跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。                                   | partial |
| C3                                                                                                                                                                                                                                                   | 三端 contract 与泄漏   | 逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。                                                                       | 同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。               | partial |
| C4                                                                                                                                                                                                                                                   | Angular 生命周期与注入 | 核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。 | 切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。              | partial |
| C5                                                                                                                                                                                                                                                   | Angular 类型与运行证据 | 核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。                                                          | typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。 | partial |
| 共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。 |

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **3** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/use-tree.spec.ts`](../../../packages/rxdb-plugin-tree-angular/src/__tests__/use-tree.spec.ts)
- [`src/__tests__/index.spec.ts`](../../../packages/rxdb-plugin-tree-angular/src/__tests__/index.spec.ts)
- [`src/__tests__/tri-framework-generics.spec.ts`](../../../packages/rxdb-plugin-tree-angular/src/__tests__/tri-framework-generics.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-tree-angular/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-angular`](rxdb-angular.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**树联审**：[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-plugin-tree-react`](rxdb-plugin-tree-react.md)、[`rxdb-plugin-tree-vue`](rxdb-plugin-tree-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-tree-angular --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-tree-angular:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-tree-angular --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-tree-angular:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-tree-angular
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-tree-angular.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 frameworks 第一轮历史记录（最新结论见 R2-02）

本轮 `main/worktree@44de1138b4d396fc45d6e76ab60476c40fef2223`，日期 2026-10-05。不是新泛计划，而是对原 C 的实际结论：**0/5 个完整 C、execution 保持 in-progress；结果记录保持 partial；本对象不是全对象完成候选。**

全部 16 个受控文件的范围/摘要已核对，正文片段 5、outline 0、仅导航 0、未人工检查 11；不能将 scope 盘点称为全读。

| 原 C                      | 本轮结论          | 原场景中仍缺的必要证据                                                                                                                                                         |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 树查询与输入类型       | partial；局部通过 | 缺 numeric id 实际查询、无 Tree 插件、QueryCache 禁止组合及深树真实仓储链路；四个同名 mock method 不能替代这些原场景。                                                         |
| C2 增量结果与参数切换     | partial；局部通过 | 没有在树 wrapper 上运行跨父移动、父删除、快速改 query、空树与销毁同 fixture；状态模型源码相同不等于真实树增量结果已复验。                                                      |
| C3 三端 contract 与泄漏   | partial；局部通过 | 缺同一真实 tree fixture 的三端状态/多实例泄漏对照及独立 typed consumer；pack root resolve 不证明声明可消费。                                                                   |
| C4 Angular 生命周期与注入 | partial；局部通过 | Angular 缺真实组件 input/provider override/route；React wrapper 套件没有 StrictMode 与多 root；Vue 套件仅 effectScope，没有真实 SFC props 深改/挂卸/晚到组合。                 |
| C5 Angular 类型与运行证据 | partial；局部通过 | 现有 fixture 不是独立声明 consumer；Angular 模板错误/route、React 同值新引用和错误 props 渲染、Vue vue-tsc/readonly/SFC pack 消费不能由 root resolve 和类型 fixture 自动补齐。 |

本轮完成条件：

- [x] 全受控 inventory / 摘要核对，未排除配置/资源/fixture。
- [ ] 全部受控内容阅读及全部原 C 场景核销（缺口见表，保持 partial）。
- [x] 每 C 已有明确的已证/未证结论及角色明确的源码、测试锚点。
- [x] 当前 baseline 的 unit / 四指标 / 零警告 lint / typecheck / 真 pack 来源已读取登记。
- [ ] 晚加探针补跑、独立 typed/runtime consumer、真实完整 UI/生命周期等必要缺口全部关闭。
- [ ] 全对象证据完成与最终评级（不要求零缺陷，但不能缺验证）；尚未完成。

本对象四指标（statements/branches/functions/lines）：**100% / 100% / 100% / 100%**；阈值各项 ≥ 80%。其余18包的绿不能抹掉 rxdb-angular 的16个失败；新探针不继承基线通过。
发布 pack 根是 `dist/packages/rxdb-plugin-tree-angular`，实际 tarball 目标文件存在、独立根 ESM 解析通过；**不包含 typed consumer 编译/runtime import**。Angular 不能按源 manifest 缺 exports 报错。

逐 C 原场景、函数/测试证据与完成条件详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-tree-angular.md`；机器证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/c-evidence.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

## 2026-10-05 R2-02：本包有界收尾（最新）

基线 `76a3848e2086f4617b80f7b1a1b896ef76e5719c`，`2026-10-05T11:13:46.687238+08:00`。原C1–C5与第6节完成条件保留，不缩场景、不把未验改不适用。

- [x] 16/16受控文件全内容实读，未读0、scope SHA漂移0；配置/文档/3原spec/setup全计入。追加1个必要spec，未改实现、原tests、依赖。
- [x] 生命周期/泛型生产链读到真实core，三端根API/原generic正文静态对照；包发布根resolved为dist，不能报源exports缺失。
- [x] 主控独立实际tar、无paths、strict skipLibCheck=false：显式node+@types/ms条件下valid0、invalid两处TS2322、root runtime import0。bare utils公开声明阻断TS2503/TS7016保留归上游，不称声明自包含。
- [x] 当前生产build exit0；初版probe零警告lint exit0；15例初测13过2fixture失败，四覆盖率100/100/100/100只覆盖wrapper8语句/4函数/0分支。
- [x] 新8例中真实缺插件/QueryCache/context/非法level/ID0-lazy/父子provider与cleanup六例已过；两组件因analog JIT缺signal input metadata而失败，仅新fixture改成Input required setter+signal，未删断言或修实现。
- [ ] 主控focused复跑修fixture的两组件/全8例、本包typecheck及修后lint；不等待无关all73后端。
- [ ] 真实SQL深树与numeric/string数据查询、跨父移动/父删除live-vs-full、同fixture三端动态、ngc模板输入/事件反例、真实route挂卸。
- [ ] 原完整C/全对象核销：仍0/5，execution=in-progress、完整对象候选false、评审完成false、发布就绪false。合理未验分流由主控裁定。

| 原C | 已测/已读局部                                                    | 原最低场景必要缺口                                 |
| --- | ---------------------------------------------------------------- | -------------------------------------------------- |
| C1  | 核心护栏/ID0/lazy/错误透明过；独立numeric/string类型正负条件性过 | 真实SQL深树与id查询数据对比                        |
| C2  | core订阅cleanup源码归属明确；组件late/input探针只修fixture       | 修后复跑、跨父移动/父删除与全量查询对比            |
| C3  | API静态对称、独立tar类型与runtime根import、父子实例cleanup过     | 同一tree fixture三端动态、组件两资源修后测量       |
| C4  | context/provider六例局部过，standalone/OnPush真实组件定义齐      | 两组件JIT fixture修后focused复跑；未将失败冒充通过 |
| C5  | strict独立d.ts正负、Node root import条件性过；bare上游风险保留   | 组件错误空态复跑、ngc输入事件负例、真实route       |

Angular tools mandatory调用已记；只发现examples，指南/文档tool响应失败。用安装22.2.1本地官方effect声明核对规范。所有业务门禁由主控执行，本代理未跑重任务或Git写命令。

核销与绝对改动清单：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/closure.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/changed-files.json`。逐文件/逐C/测量细节：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/file-inspection.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/c-evidence.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/validation-observations.json`。验证请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/validation-requests.json`。

### 原required-input场景不得由替代夹具核销（最终补充）

初版**已证**的是TestBed/JIT未识别输入（NG0303）导致绑定失败，随后读空required signal（NG0950）；**未证**的是正确ngc编译并正确父模板绑定后生产是否仍可达、最终根因归属。此前倾向fixture编译边界的判断仅是证据解释，不是生产不可达结论。setter+signal(0)只恢复其他生命周期测量，不核销原input.required场景。

原夹具快照 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/probe-original-required-input.spec.ts.txt`，SHA `2859c2fb42ac2232b003b8b05302fa441686139a73a8d7da13e7e820c8838c21`，与主控实际测量SHA匹配=True；原日志保留不删除。独立 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-required-input.mts` 保持 `input.required<number>()` 和tree hook options getter，父组件 `RequiredInputHost` 用模板显式 `[rootId]="rootId()"` 绑定。需主控ngc编译与运行0→7、无NG0303/NG0950对照，R2-02-V6，尚未执行。它不替typed tsc、SQL、route，也不把C4/全对象绿化。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
