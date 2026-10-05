---
kind: review-plan
object: rxdb-plugin-replay-angular
source_root: packages/rxdb-plugin-replay-angular
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
source_review: complete-original-scope
opinion_delivery: complete-original-scope
scenario_evidence: partial
release_readiness: not-claimed
---

# rxdb-plugin-replay-angular：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Angular：回放播放器挂载、资源装载和 commit 恢复交互的框架封装。

| 项目                | 基线事实                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                    |
| 源码范围            | [`packages/rxdb-plugin-replay-angular`](../../../packages/rxdb-plugin-replay-angular) |
| Nx 项目             | `rxdb-plugin-replay-angular`                                                          |
| npm 名称            | `@aiao/rxdb-plugin-replay-angular`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）          |
| 建议波次 / 优先风险 | W4 / 中（排期依据，不是缺陷结论）                                                     |
| 受控文件盘点        | 15 个；测试/共享套件入口 2 个（按文件名，不代表覆盖率）                               |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                             |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/replayer.component.ts`](../../../packages/rxdb-plugin-replay-angular/src/replayer.component.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-replay-angular/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-replay-angular/README.md)
- [`package.json`](../../../packages/rxdb-plugin-replay-angular/package.json)
- [`project.json`](../../../packages/rxdb-plugin-replay-angular/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-replay-angular/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-replay-angular/tsconfig.json)

公共边界：

- 源 `package.json` 未声明 `exports`；继续追踪构建/打包生成的入口与声明，不能直接认定没有公开 API。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-replay-angular.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb-plugin-replay: *`、`@angular/core: 22.1.6`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号                                                                                                                                                                                                                                                 | 专项                   | 核查动作                                                                                                                                       | 最低复验场景 / 证据要求                                                                          | 状态    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| C1                                                                                                                                                                                                                                                   | 播放器挂载与按需依赖   | 核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。                                                         | 空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。                  | partial |
| C2                                                                                                                                                                                                                                                   | 恢复交互与状态         | 跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。                                                                 | 不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。            | partial |
| C3                                                                                                                                                                                                                                                   | 三端可访问性与类型     | 对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。                                                                        | 同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。         | partial |
| C4                                                                                                                                                                                                                                                   | Angular 生命周期与注入 | 核查注入上下文、DestroyRef/effect cleanup、provider scope 和框架原生 Signal 更新；按仓库约定检查 standalone/OnPush，避免为风格改写已稳定 API。 | 切换 inputs、销毁中异步完成、子 provider 覆盖、同组件多实例；无订阅泄漏或跨库状态。              | partial |
| C5                                                                                                                                                                                                                                                   | Angular 类型与运行证据 | 核查模板类型、泛型推导和真实组件 fixture；区分纯函数、模拟组件与浏览器/实际应用证据。                                                          | typed consumer 编译、模板事件/输入错误、错误与空态；真实 route 挂载/卸载，不用类型断言掩盖错误。 | partial |
| 共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。 |

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **2** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/replayer.component.spec.ts`](../../../packages/rxdb-plugin-replay-angular/src/__tests__/replayer.component.spec.ts)
- [`src/__tests__/release-config.spec.ts`](../../../packages/rxdb-plugin-replay-angular/src/__tests__/release-config.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-replay-angular/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb-plugin-replay`](rxdb-plugin-replay.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**回放联审**：[`rxdb-plugin-replay`](rxdb-plugin-replay.md)、[`rxdb-plugin-replay-react`](rxdb-plugin-replay-react.md)、[`rxdb-plugin-replay-vue`](rxdb-plugin-replay-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-replay-angular --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-replay-angular:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-replay-angular --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-replay-angular:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-replay-angular
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-replay-angular.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 frameworks 本轮完成条件与实际核查

本轮 `main/worktree@44de1138b4d396fc45d6e76ab60476c40fef2223`，日期 2026-10-05。不是新泛计划，而是对原 C 的实际结论：**0/5 个完整 C、execution 保持 in-progress；结果记录保持 partial；本对象不是全对象完成候选。**

全部 15 个受控文件的范围/摘要已核对，正文片段 5、outline 0、仅导航 0、未人工检查 10；不能将 scope 盘点称为全读。

| 原 C                      | 本轮结论          | 原场景中仍缺的必要证据                                                                                                                                      |
| ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 播放器挂载与按需依赖   | partial；局部通过 | 空 recording、加载失败、切 recording、双播放器和无后台录制的实际核心/浏览器链路尚缺。                                                                       |
| C2 恢复交互与状态         | partial；局部通过 | parity 只有手动触发 restore callback；缺实际 marker 点击、不可达/dirty/并发 restore 与恢复中卸载的加载/拒绝序列。                                           |
| C3 三端可访问性与类型     | partial；局部通过 | 缺同 recording/marker 序列的真实 UI、尺寸变化、键盘与错误提示；七条边界桩 parity 不覆盖控件可访问性。                                                       |
| C4 Angular 生命周期与注入 | partial；局部通过 | 缺销毁中真实 async 完成、同组件多实例/多个 root；Angular 缺 provider/route；Vue 缺 ref/computed/getter 真实父子链路。React first layout seek 另有未跑回归。 |
| C5 Angular 类型与运行证据 | partial；局部通过 | 独立 typed consumer 未执行；Angular 模板负例/真实 route，React 首次 layout 命令及错误 props，Vue SFC emits/readonly/模板消费仍未完整验证。                  |

本轮完成条件：

- [x] 全受控 inventory / 摘要核对，未排除配置/资源/fixture。
- [ ] 全部受控内容阅读及全部原 C 场景核销（缺口见表，保持 partial）。
- [x] 每 C 已有明确的已证/未证结论及角色明确的源码、测试锚点。
- [x] 当前 baseline 的 unit / 四指标 / 零警告 lint / typecheck / 真 pack 来源已读取登记。
- [ ] 晚加探针补跑、独立 typed/runtime consumer、真实完整 UI/生命周期等必要缺口全部关闭。
- [ ] 全对象证据完成与最终评级（不要求零缺陷，但不能缺验证）；尚未完成。

本对象四指标（statements/branches/functions/lines）：**97.72% / 93.75% / 100% / 100%**；阈值各项 ≥ 80%。其余18包的绿不能抹掉 rxdb-angular 的16个失败；新探针不继承基线通过。
发布 pack 根是 `dist/packages/rxdb-plugin-replay-angular`，实际 tarball 目标文件存在、独立根 ESM 解析通过；**不包含 typed consumer 编译/runtime import**。Angular 不能按源 manifest 缺 exports 报错。

逐 C 原场景、函数/测试证据与完成条件详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-replay-angular.md`；机器证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/c-evidence.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。

## 2026-10-05 R2-10：15 文件有界收尾（最新结论）

**本代理交付完成；原计划仍 `in-progress`。** 15/15 原受控文件全正文实读，共 556 行；配置/测试/README/LICENSE 无排除，源码/旧测试/依赖修改均为 0。此前“5 片段/10 未读”是历史状态，本节取代该阅读结论。详情 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/file-inspection.json`。

源码起始 HEAD `76a3848e2086f4617b80f7b1a1b896ef76e5719c`，交付 HEAD `76a3848e2086f4617b80f7b1a1b896ef76e5719c`；scope 15 摘要均匹配且读取期间不变。HEAD 因外部并行工作变化，不把整仓 HEAD 相同当成测量依据。当前 scope/发布 peer Angular **22.2.1**，原计划 22.1.6 是历史基线。

| 原 C                      | R2-10 结论                                                             | 必要未验与 owner                                                                                             |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| C1 播放器挂载与按需依赖   | partial；单 mount/delta/destroy 旧边界通过，真实核心状态源已读         | 新 Angular+未打桩 core 空/错/切换/双实例/销毁 probe 待主控；真实 rrweb loader/player 链不由 happy-dom 核销   |
| C2 恢复交互与状态         | partial；marker/pending/result/callback/HEAD 所有权明确                | 主控跑受控结果 probe；真实 unreachable/dirty/CAS 决策不能用受控恢复结果替代                                  |
| C3 三端可访问性与类型     | partial；公开 payload/hint/options/commands 静态对齐，原生控件属性已读 | 主控补同 recording/marker 三端实际结果、resize、Tab/Space/Enter/Arrow；click/input 不是键盘验证              |
| C4 Angular 生命周期与注入 | partial；OnPush/standalone/signals/DestroyRef 核对                     | 新原生 Angular consumer 父子 provider/多实例/异步晚完成/首次渲染前销毁 probe 待主控，不强加包内 provider API |
| C5 Angular 类型与运行证据 | partial；APF 真根声明/导入已证，正反例已冻结                           | 主控独立 tarball tsc + ngc 模板正反例、真实 route 挂载/卸载；语法 parse 不算 typed 通过                      |

**完整 C：0/5；完整对象候选：否。** 只有完整原场景才核销；必要未验 owner 为主控。本任务不等待其他 73 对象，不无限扩大 rrweb/core 录制库所有宿主。

主控当前本包旧测试 **10/10**，四覆盖 **97.72 / 93.75 / 100 / 100%**，fresh build / lint 0、实际 tarball root import 0。测量只覆盖旧 wrapper 与 core 边界桩；新增 spec 不继承旧通过。十包 unit 批总 exit 1 与本包旧套通过区分记录。

新增且冻结 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/src/__tests__/review-round2-player-lifecycle.spec.ts`：14 个场景，真实 Angular fixture + 未打桩 `mountReplayer`，ReplayManager/rrweb 边界受控；不冒充原生播放器、IME、工作树决策或 route 端到端。最小请求 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/validation-requests.json` 已交主控；本代理未执行 build/test/coverage/e2e/server。

独立 consumer `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/consumer-valid.mts` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/consumer-invalid.mts` 无 paths/any/类型断言/ts suppress；**额外** node ambient、`@types/node`、`@types/ms` 要求写明，裸上游 utils 诊断保留。RV-070 仅 React 既有意见引用，不泛化三端；本对象新增发现 0。

完成条件：F1 全受控实读通过；F2/F3/F6 已完整报告真实结论/锚点/归属；F4 新门禁与类型、F5 完整用户链、F7 完整对象/发布状态仍 partial。机器证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/closure.json` 与 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-replay-angular/c-evidence.json` 不删除原要求。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。
