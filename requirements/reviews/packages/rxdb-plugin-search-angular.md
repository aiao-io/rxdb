---
kind: review-plan
object: rxdb-plugin-search-angular
source_root: packages/rxdb-plugin-search-angular
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-plugin-search-angular：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Angular：SearchHandle 的框架响应式输入、结果、状态与清理封装。

| 项目                | 基线事实                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                    |
| 源码范围            | [`packages/rxdb-plugin-search-angular`](../../../packages/rxdb-plugin-search-angular) |
| Nx 项目             | `rxdb-plugin-search-angular`                                                          |
| npm 名称            | `@aiao/rxdb-plugin-search-angular`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）          |
| 建议波次 / 优先风险 | W4 / 中（排期依据，不是缺陷结论）                                                     |
| 受控文件盘点        | 16 个；测试/共享套件入口 3 个（按文件名，不代表覆盖率）                               |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                             |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/inject-search.ts`](../../../packages/rxdb-plugin-search-angular/src/inject-search.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-search-angular/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-search-angular/README.md)
- [`package.json`](../../../packages/rxdb-plugin-search-angular/package.json)
- [`project.json`](../../../packages/rxdb-plugin-search-angular/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-search-angular/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-search-angular/tsconfig.json)

公共边界：

- 源 `package.json` 未声明 `exports`；继续追踪构建/打包生成的入口与声明，不能直接认定没有公开 API。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-search-angular.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: *`、`@aiao/rxdb-plugin-search: *`、`@angular/core: 22.1.6`、`rxjs: ^7.8.2`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号                                                                                                                                                                                                                                                 | 专项                        | 核查动作                                                                                                                                       | 最低复验场景 / 证据要求                                                                          | 状态    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| C1                                                                                                                                                                                                                                                   | SearchHandle 映射           | 逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。                                              | 空词、无结果、查询失败、清空、末页；框架状态不能吞掉核心错误。                                   | partial |
| C2                                                                                                                                                                                                                                                   | 快速输入与 options identity | 核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。                                                                          | A→B 快速输入、相同值新对象、换库/branch、并发翻页；不重复创建 handle 或串结果。                  | partial |
| C3                                                                                                                                                                                                                                                   | 三端类型与依赖闭合          | 对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。                                                         | 缺 plugin、typed consumer、同 fixtures parity、卸载；必须依赖能通过 inject 闭合。                | partial |
| C4                                                                                                                                                                                                                                                   | Angular 生命周期与注入      | 核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。 | 切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。              | partial |
| C5                                                                                                                                                                                                                                                   | Angular 类型与运行证据      | 核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。                                                          | typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。 | partial |
| 共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。 |

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **3** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/inject-search.spec.ts`](../../../packages/rxdb-plugin-search-angular/src/__tests__/inject-search.spec.ts)
- [`src/__tests__/index.spec.ts`](../../../packages/rxdb-plugin-search-angular/src/__tests__/index.spec.ts)
- [`src/__tests__/release-config.spec.ts`](../../../packages/rxdb-plugin-search-angular/src/__tests__/release-config.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-search-angular/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**搜索联审**：[`rxdb-plugin-search`](rxdb-plugin-search.md)、[`rxdb-plugin-search-react`](rxdb-plugin-search-react.md)、[`rxdb-plugin-search-vue`](rxdb-plugin-search-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-search-angular --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-search-angular:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-search-angular --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-search-angular:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-search-angular
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-search-angular.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 frameworks 本轮完成条件与实际核查

本轮 `main/worktree@44de1138b4d396fc45d6e76ab60476c40fef2223`，日期 2026-10-05。不是新泛计划，而是对原 C 的实际结论：**0/5 个完整 C、execution 保持 in-progress；结果记录保持 partial；本对象不是全对象完成候选。**

全部 16 个受控文件的范围/摘要已核对，正文片段 3、outline 0、仅导航 0、未人工检查 13；不能将 scope 盘点称为全读。

| 原 C                           | 本轮结论          | 原场景中仍缺的必要证据                                                                                                              |
| ------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| C1 SearchHandle 映射           | partial；局部通过 | 三端同序列空词→无结果→失败→重试→末页→清空的真实 core handle 新探针已写，主控尚未补跑；因此不把 C1 提前核销。                        |
| C2 快速输入与 options identity | partial；局部通过 | 缺 A→B 真正异步查询代次与 branch 变化并发翻页的三端同 fixture；既有桩 emission 隔离不等价于完整搜索后端时序。                       |
| C3 三端类型与依赖闭合          | partial；局部通过 | pack 证据未执行声明编译/runtime import；缺插件、backend 不支持、typed root consumer 及同 fixtures parity 的完整消费链路未全部覆盖。 |
| C4 Angular 生命周期与注入      | partial；局部通过 | 缺真实组件 input/子 provider 覆盖、组件多实例与 route 反复挂卸。                                                                    |
| C5 Angular 类型与运行证据      | partial；局部通过 | Angular 模板输入/事件错误与真实 route 尚缺。                                                                                        |

本轮完成条件：

- [x] 全受控 inventory / 摘要核对，未排除配置/资源/fixture。
- [ ] 全部受控内容阅读及全部原 C 场景核销（缺口见表，保持 partial）。
- [x] 每 C 已有明确的已证/未证结论及角色明确的源码、测试锚点。
- [x] 当前 baseline 的 unit / 四指标 / 零警告 lint / typecheck / 真 pack 来源已读取登记。
- [ ] 晚加探针补跑、独立 typed/runtime consumer、真实完整 UI/生命周期等必要缺口全部关闭。
- [ ] 全对象证据完成与最终评级（不要求零缺陷，但不能缺验证）；尚未完成。

本对象四指标（statements/branches/functions/lines）：**100% / 100% / 100% / 100%**；阈值各项 ≥ 80%。其余18包的绿不能抹掉 rxdb-angular 的16个失败；新探针不继承基线通过。
发布 pack 根是 `dist/packages/rxdb-plugin-search-angular`，实际 tarball 目标文件存在、独立根 ESM 解析通过；**不包含 typed consumer 编译/runtime import**。Angular 不能按源 manifest 缺 exports 报错。

逐 C 原场景、函数/测试证据与完成条件详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-search-angular.md`；机器证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/c-evidence.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

## 2026-10-05 parallel-round2：本包有界收尾交付

本节是**最新状态**；前一轮统计保留为历史，不代表当前阅读范围。用户任务 **R2-04**，本包 `scope.json` 标记 **R2-05**；按同一个明确对象执行，未改 scope。阅读 HEAD `76a3848e2086f4617b80f7b1a1b896ef76e5719c`，记录时间 `2026-10-05T11:10:29.638149+08:00`。

**代理负责的源码阅读/证据/探针交付已收尾，主控实际验证待续入；execution 保持 in-progress，完整 C 仍 0/5，非全对象完成候选。** 不等其他大包修复，不将等待验证改称不适用。

### 范围、来源与测量边界

- 原 scope **17/17 文件全文读完**，SHA 全部吻合；LICENSE、README、配置、全部四个原 spec 与生产入口均未默认排除。详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/file-inspection.json`。
- 只额外新增本包 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/review-round2-lifecycle.spec.ts`，**13 个探针 case 已冻结**；不改原测试、实现、依赖、README、RV 或总台账。scope 的17个原文件与新增探针单独计数。
- `ng-package.json` 生成 APF，resolved 发布根是 `dist/packages/rxdb-plugin-search-angular`；当前生成声明已读，bundle source-map 内容与 `inject-search.ts` 相符。未由本代理重建或声明新 HEAD 可重复构建成功。
- 原22测试通过与 statements/branches/functions/lines **100%/100%/100%/100%** 仅限旧测量；当前已测源码子集 SHA 无漂移，但 late C1 probe SHA 已变，新13例不继承旧绿。
- 独立真实 tar 根 import **exit0**。补充 Node ambient + `@types/ms` 后，strict/all-d.ts、`skipLibCheck=false` 的正例 **exit0**，负例 **exit2** 且五个错误位于本 consumer 调用行。fixture SHA 与本目录正负例一致。
- **裸环境仍失败**：上游 utils 的 NodeJS / ms 公开声明错误保留。对照通过不是普通 consumer 声明自闭合通过；Angular Node root import 显式预载 compiler，不代表运行了无上下文 `useSearch` 或完整 UI。

### 原 C 不缩小：已证子面与剩余必要动作

| C                              | 已证子面                                                                                   | 必要未验 / 当前结论                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| C1 SearchHandle 映射           | 四流/五态、readonly 输出、最新handle命令；历史真实core序列通过                             | 当前88行 real-handle spec 需重跑；新分页拒绝透传探针待主控。**partial**                                                            |
| C2 快速输入与 options identity | core debounce 归属、语义相等判据、initialQuery仅初始种子、旧订阅先释放                     | 快速A→B、真实换源/在途分页新探针待跑；同一个真实RxDB branch交错和更强中间时序仍需主控证据。source-new名称不当成branch。**partial** |
| C3 三端类型与依赖闭合          | 三端实际root/class/type对称；core inject/backend fail-fast归属；有条件tar正负/根import实测 | bare公开声明风险待裁定；缺plugin/不支持backend真实RxDB路径和当前同fixture parity尚缺；README required input候选未复验。**partial** |
| C4 Angular 生命周期与注入      | DestroyRef/两effect/四Subscription清理，ErrorHandler与可恢复error分工；历史injector测试    | 组件inputs、子provider/三个实例、销毁中late成功或失败、四路协议error新探针待主控；不当成browser。**partial**                       |
| C5 Angular 类型与运行证据      | 非实体泛型API的实际签名、严格tar正负consumer有条件验证、真实demo入口已读                   | ngc strictTemplates模板正负例和真正route挂卸未验；tsc/Vite JIT不是模板编译。**partial**                                            |

新增源码只用真实 `createSearchHandle` + 明确的异步 executor 接缝，mock协议流用于 ErrorHandler 专项；分别记录，不冒称真实 SQL。健康 JIT fixture 用真实 `@Input` setter 桥接 signal，避免在无 Angular transformer 的 Vite 中制造 input 元数据假失败；required input 候选测试只针对构造阶段同步读取。

### 原完成条件逐条收束

1. **通过**：17原文件清点与全文阅读、生成来源/发布入口登记完成。
2. **通过（登记层）**：五个原 C 的动作/最低场景保留，结论均明确为 partial，补证到具体动作；不是完整 C 核销。
3. **partial**：源码不变量、历史运行与新探针角色分开；新动态主张仍等主控日志。
4. **partial**：旧命令/缓存/skip/四指标已登记；主控本轮10包 unit+coverage/lint 在跑，不能预填结果。
5. **partial**：三端/core/consumer归属已对照；bare风险、ngc、真实 branch/route 未补齐。
6. **通过（去重与诚实登记）**：RV-062只引用；README required input仅静态候选，主控复验后决定是否登记新RV。
7. **partial**：阶段品质🟡；最终全对象评级、reviewComplete/releaseReady/fullObjectCandidate 均不核销。

### 主控接续：只跑必要 target / 消费面

`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/validation-requests.json` 已给出 project/target/args/reason/criticalForC；本代理没有执行 build/test/coverage/lint/typecheck/e2e/server/容器或 consumer 编译。

- 当前包 `test`、零警告 `lint`、`typecheck` 与 production `build` 的指纹/skip/逐case/四指标由主控记录。
- 有条件tar `.mts`正负编译与根import已实测，无需重复；保留 bare 失败对照和附加类型环境限制。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/template-valid.ts` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/template-invalid.ts` 需要独立 `ngc strictTemplates=true`；仅 `.mts` tsc 不够。
- 已发现真实 `dev-rxdb-angular-e2e:e2e-ci--src/search.spec.ts`，但现有单例只覆盖a11y与模拟错误，不能单凭它关闭真实query失败、branch+分页或route反复挂卸；主控补最小动态证据/裁定，不能擅自删除要求。

机器闭环 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-angular/closure.json`：原17文件全读、13个新case冻结、完整 C 0/5、局部子面及剩余动作齐全；**本包代理交付完成不等于全对象评审/发布就绪**。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。

当轮确认意见：[RV-077](../RV-077-round2-angular-required-search.md)，公开输入边界与独立正确peer环境复验，不等于所有消费情形失败。
