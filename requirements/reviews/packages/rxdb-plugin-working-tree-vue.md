---
kind: review-plan
object: rxdb-plugin-working-tree-vue
source_root: packages/rxdb-plugin-working-tree-vue
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
source_review: complete-original-scope
opinion_delivery: complete-original-scope
scenario_evidence: partial
release_readiness: not-claimed
---

# rxdb-plugin-working-tree-vue：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Vue：working-tree status/diff/commit/discard/restore 的框架状态与动作封装。

| 项目                | 基线事实                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                        |
| 源码范围            | [`packages/rxdb-plugin-working-tree-vue`](../../../packages/rxdb-plugin-working-tree-vue) |
| Nx 项目             | `rxdb-plugin-working-tree-vue`                                                            |
| npm 名称            | `@aiao/rxdb-plugin-working-tree-vue`                                                      |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）              |
| 建议波次 / 优先风险 | W4 / 高（排期依据，不是缺陷结论）                                                         |
| 受控文件盘点        | 14 个；测试/共享套件入口 2 个（按文件名，不代表覆盖率）                                   |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                                 |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/use-working-tree.ts`](../../../packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-working-tree-vue/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-working-tree-vue/README.md)
- [`package.json`](../../../packages/rxdb-plugin-working-tree-vue/package.json)
- [`project.json`](../../../packages/rxdb-plugin-working-tree-vue/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-working-tree-vue/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-working-tree-vue/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-working-tree-vue.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: *`、`@aiao/rxdb-plugin-working-tree: *`、`@aiao/rxdb-vue: *`、`rxjs: ^7.8.2`、`vue: ^3.5.43`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号                                                                                                                                                                                                                                                 | 专项                     | 核查动作                                                                                                                  | 最低复验场景 / 证据要求                                                                                  | 状态    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| C1                                                                                                                                                                                                                                                   | 状态与作用域             | 核查 activation/branch/能力状态如何进入 hook，status/diff 订阅必须归属当前数据库。                                        | 未 enable、插件缺失、切分支、换库、多实例；不显示旧库 diff 或偷偷启用数据库能力。                        | partial |
| C2                                                                                                                                                                                                                                                   | 动作结果与并发           | 逐项对照 commit/discard/restore 的返回值拒绝和 switchBranch 的异常，不能一律当异常或成功。                                | CAS 落败、dirty tree、不可达 commit、并发点击、动作中换 scope；原有数据不损坏。                          | partial |
| C3                                                                                                                                                                                                                                                   | 三端与敏感数据           | 核查更新触发、错误显示、diff 摘要和类型消费，并与 shared fixtures / 应用工作树场景对应。                                  | 相同拒绝序列三端同语义、关闭清理、敏感字段摘要；不能为调试直接输出完整历史。                             | partial |
| C4                                                                                                                                                                                                                                                   | Vue 生命周期与响应式来源 | 核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。 | 替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。                             | partial |
| C5                                                                                                                                                                                                                                                   | Vue 类型与 SFC 消费      | 核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。                                   | vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。 | partial |
| 共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。 |

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **2** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/use-working-tree.spec.ts`](../../../packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts)
- [`src/__tests__/index.spec.ts`](../../../packages/rxdb-plugin-working-tree-vue/src/__tests__/index.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-working-tree-vue/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-vue`](rxdb-vue.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**工作树联审**：[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-plugin-working-tree-angular`](rxdb-plugin-working-tree-angular.md)、[`rxdb-plugin-working-tree-react`](rxdb-plugin-working-tree-react.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-working-tree-vue --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree-vue:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-working-tree-vue --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree-vue:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-working-tree-vue
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [x] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [x] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-working-tree-vue.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 frameworks 本轮完成条件与实际核查

本轮 `main/worktree@44de1138b4d396fc45d6e76ab60476c40fef2223`，日期 2026-10-05。不是新泛计划，而是对原 C 的实际结论：**0/5 个完整 C、execution 保持 in-progress；结果记录保持 partial；本对象不是全对象完成候选。**

全部 14 个受控文件的范围/摘要已核对，正文片段 5、outline 1、仅导航 0、未人工检查 8；不能将 scope 盘点称为全读。

| 原 C                        | 本轮结论          | 原场景中仍缺的必要证据                                                                                                                                                     |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 状态与作用域             | partial；局部通过 | 未 enable、缺插件、真实 branch/数据库切换和多实例状态 ownership 未全证；React provider 切 A→B 候选的两条新回归等待主控，不提前算红/绿。                                    |
| C2 动作结果与并发           | partial；局部通过 | 缺真实数据层并发点击/CAS 落败不损坏数据以及动作中换 scope；现有 IO fixture 不拥有真正数据库。React 旧 commands 回写新 scope 候选待补跑。                                   |
| C3 三端与敏感数据           | partial；局部通过 | 缺真实应用拒绝序列、关闭期间晚到状态、多实例敏感 diff 摘要/清理以及独立 typed 消费；不能用 100% wrapper coverage 证明 core 历史数据安全。                                  |
| C4 Vue 生命周期与响应式来源 | partial；局部通过 | Angular 实际组件销毁/子 provider、多实例；React StrictMode/多 root/旧库 pending（新 probe 未跑）；Vue provider ref 替换与 SFC scope/晚到命令，均未完整证明。               |
| C5 Vue 类型与 SFC 消费      | partial；局部通过 | Angular 模板/route、React 独立 typed consumer + StrictMode 错误 props、Vue vue-tsc/SFC readonly/emits pack consumer 未完整验证；root resolve 是路径证据而非声明/运行证明。 |

本轮完成条件：

- [x] 全受控 inventory / 摘要核对，未排除配置/资源/fixture。
- [ ] 全部受控内容阅读及全部原 C 场景核销（缺口见表，保持 partial）。
- [x] 每 C 已有明确的已证/未证结论及角色明确的源码、测试锚点。
- [x] 当前 baseline 的 unit / 四指标 / 零警告 lint / typecheck / 真 pack 来源已读取登记。
- [ ] 晚加探针补跑、独立 typed/runtime consumer、真实完整 UI/生命周期等必要缺口全部关闭。
- [ ] 全对象证据完成与最终评级（不要求零缺陷，但不能缺验证）；尚未完成。

本对象四指标（statements/branches/functions/lines）：**100% / 100% / 100% / 100%**；阈值各项 ≥ 80%。其余18包的绿不能抹掉 rxdb-angular 的16个失败；新探针不继承基线通过。
发布 pack 根是 `packages/rxdb-plugin-working-tree-vue`，实际 tarball 目标文件存在、独立根 ESM 解析通过；**不包含 typed consumer 编译/runtime import**。Angular 不能按源 manifest 缺 exports 报错。

逐 C 原场景、函数/测试证据与完成条件详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-working-tree-vue.md`；机器证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/c-evidence.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

## 2026-10-05 R2-08 包级有界收尾

**phase: done（本轮阅读/证据交付）；execution 仍 in-progress/partial；完整 C 0/5，完整对象候选 false。** scope 的 R2-09 与用户的 R2-08 编号不一致，按唯一对象执行，未修改 scope。本轮观测 HEAD `76a3848e2086f4617b80f7b1a1b896ef76e5719c`；持续外部改动下，14 个受控文件与 scope 指纹全部相符。

- [x] 14/14 文件正文完整实读（不是 sha/outline），包含全部 tests/fixture/README/LICENSE/配置；记录具体行区间和关注点。
- [x] 五个原 C 的原动作、最低场景、局部已证、源码锚点、必要未验与动作逐项落盘；没有删原要求。
- [x] 三端 12 状态/12 命令和生成 dts 静态对齐；native 形态/绑定生命周期差异如实记载。
- [x] 主控当前原 48 tests、四项 100%、build/lint 与真 tar root import 0 证据读取登记；branches 为 0/0，两个 harness 在 coverage 面内。
- [x] 两份独立 .mts consumer、两份最小 SFC consumer 与 9-case review-round2 probe 已交付；零 workspace alias、零 any、零 expect-error。
- [ ] 新 probe/SFC consumer 的匹配 SHA 结果、当前 typecheck 与真实完整原场景证据由主控收尾；本任务未跑重门禁。

| 原 C | 本轮局部结论                                                                   | 不能宣称完整通过的原因                                                                                                   |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| C1   | 初态/显式查询与 branch status 刷新已有原 unit 证据；Ref 换库仍是旧实例快照     | 新未 enable/缺插件/多实例 probe 未跑；真实库/branch ownership 与旧 diff 不显示未全证                                     |
| C2   | CAS/restore 返回值拒绝与 dirty 异常语义保留；latest-only 是逐 key 代次         | 新并发/飞行换 scope probe 未跑；真实事务并发/CAS 数据无损不能由桩证明                                                    |
| C3   | 三端公开成员/core 类型对齐，wrapper 不输出调试历史                             | watcher 停止不等于 retained diff/late patch 清理；实际三端序列/关闭/敏感摘要未全证                                       |
| C4   | 零入参 API；provider Ref 与一次性 factory 区分，没用 live getter/watch/dispose | source snapshot 不能说成响应式重绑定；晚到命令、深改/provider computed 与真实 SFC 生命周期仍缺验证                       |
| C5   | 实际 tar root runtime import 0；源/生成 dts/发布 JS 字节和 24 成员核对         | .mts strict 正/反例已通过（SHA 对齐）；.vue vue-tsc 正反例与实际用户链路未测；显式 Node/@types/ms 不证明 bare 声明自包含 |

原七项完成条件分类见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/closure.json`：1、2 satisfied；3–7 partial。🟡 是有证据的本轮有限结论，不是全对象绿，也不是发布就绪。

具体机器证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/file-inspection.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/api-comparison.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/c-evidence.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/validation-observations.json`。最小主控动作：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/validation-requests.json`；新测试不继承原 48 tests 通过。

### 交接前增量证据（不继承 SFC/生命周期通过）

主控独立 .mts consumer 在 2026-10-05 11:31:58（+08:00）已测：正例 exit=0；反例 exit=2，五条预定诊断全部匹配，两份 fixture SHA 与本目录一致。因此仅 typed .mts 子面已核销，**完整 C5 仍 partial**，SFC/vue-tsc 和真实用户链路未测。详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/validation-observations.json`。

实际 tar 的 JS/dts/src 五份文件与 current 逐字节一致；package.json 的 workspace:* devDependencies 被 pack 转成 0.0.26，键顺序不同，故原始 manifest 字节不相同。已逐项核对 name/version/type/exports/types/import/main/module/files/peers 等发布相关键一致，未误报为源码漂移或假称原始字节全相同。

### 14 文件包职责归属与冻结交接

本包 **state / commands / typedSource 的源码评审已闭合，phase done**；不继续等待通用 core 的全部后端/历史验证。冻结新 probe SHA-256 `6327e258a03caffc502c1aee426d5f370ea1cf56ac27e37a12407b110e56794c`，共 9 场景，主控执行；本任务此后不增删探针。

原 C 的真实事务/CAS 数据无损、实际分支/换库数据 ownership、敏感摘要 UI、关闭库/设备/浏览器链路仍如实未验，归 core/应用/平台评审。它们不是继续扩大本包职责或无限等待的理由，也没有被改成不适用。包内独立 .mts typedSource 已过；最小 .vue 与冻结 probe 由主控补测。**评审交付完成 ≠ 原最低场景全部已测 ≠ 平台全部通过 ≠ 发布就绪**；完整 C 仍 0/5，closure 已逐项分类。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
