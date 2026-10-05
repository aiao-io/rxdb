---
kind: review-plan
object: rxdb-plugin-working-tree-react
source_root: packages/rxdb-plugin-working-tree-react
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-working-tree-react：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

React：working-tree status/diff/commit/discard/restore 的框架状态与动作封装。

| 项目                | 基线事实                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                            |
| 源码范围            | [`packages/rxdb-plugin-working-tree-react`](../../../packages/rxdb-plugin-working-tree-react) |
| Nx 项目             | `rxdb-plugin-working-tree-react`                                                              |
| npm 名称            | `@aiao/rxdb-plugin-working-tree-react`                                                        |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）                  |
| 建议波次 / 优先风险 | W4 / 高（排期依据，不是缺陷结论）                                                             |
| 受控文件盘点        | 12 个；测试/共享套件入口 2 个（按文件名，不代表覆盖率）                                       |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                                     |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/use-working-tree.ts`](../../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-working-tree-react/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-working-tree-react/README.md)
- [`package.json`](../../../packages/rxdb-plugin-working-tree-react/package.json)
- [`project.json`](../../../packages/rxdb-plugin-working-tree-react/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-working-tree-react/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-working-tree-react/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-working-tree-react.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: *`、`@aiao/rxdb-plugin-working-tree: *`、`@aiao/rxdb-react: *`、`react: ^19.2.8`、`rxjs: ^7.8.2`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号                                                                                                                                                                                                                                                 | 专项                     | 核查动作                                                                                                             | 最低复验场景 / 证据要求                                                                               | 状态    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| C1                                                                                                                                                                                                                                                   | 状态与作用域             | 核查 activation/branch/能力状态如何进入 hook，status/diff 订阅必须归属当前数据库。                                   | 未 enable、插件缺失、切分支、换库、多实例；不显示旧库 diff 或偷偷启用数据库能力。                     | partial |
| C2                                                                                                                                                                                                                                                   | 动作结果与并发           | 逐项对照 commit/discard/restore 的返回值拒绝和 switchBranch 的异常，不能一律当异常或成功。                           | CAS 落败、dirty tree、不可达 commit、并发点击、动作中换 scope；原有数据不损坏。                       | partial |
| C3                                                                                                                                                                                                                                                   | 三端与敏感数据           | 核查更新触发、错误显示、diff 摘要和类型消费，并与 shared fixtures / 应用工作树场景对应。                             | 相同拒绝序列三端同语义、关闭清理、敏感字段摘要；不能为调试直接输出完整历史。                          | partial |
| C4                                                                                                                                                                                                                                                   | React 生命周期与竞态     | 核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。 | StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。                   | partial |
| C5                                                                                                                                                                                                                                                   | React 类型与 render 边界 | 检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。                                  | typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。 | partial |
| 共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。 |

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **2** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/use-working-tree.spec.tsx`](../../../packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx)
- [`src/__tests__/index.spec.ts`](../../../packages/rxdb-plugin-working-tree-react/src/__tests__/index.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-working-tree-react/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-react`](rxdb-react.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-react`](../apps/dev-rxdb-react.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**工作树联审**：[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-plugin-working-tree-angular`](rxdb-plugin-working-tree-angular.md)、[`rxdb-plugin-working-tree-vue`](rxdb-plugin-working-tree-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-working-tree-react --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree-react:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-working-tree-react --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree-react:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-working-tree-react
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-working-tree-react.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 frameworks 本轮完成条件与实际核查

本轮 `main/worktree@44de1138b4d396fc45d6e76ab60476c40fef2223`，日期 2026-10-05。不是新泛计划，而是对原 C 的实际结论：**0/5 个完整 C、execution 保持 in-progress；结果记录保持 partial；本对象不是全对象完成候选。**

全部 12 个受控文件的范围/摘要已核对，正文片段 4、outline 0、仅导航 0、未人工检查 8；不能将 scope 盘点称为全读。

| 原 C                        | 本轮结论          | 原场景中仍缺的必要证据                                                                                                                                                     |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 状态与作用域             | partial；局部通过 | 未 enable、缺插件、真实 branch/数据库切换和多实例状态 ownership 未全证；React provider 切 A→B 候选的两条新回归等待主控，不提前算红/绿。                                    |
| C2 动作结果与并发           | partial；局部通过 | 缺真实数据层并发点击/CAS 落败不损坏数据以及动作中换 scope；现有 IO fixture 不拥有真正数据库。React 旧 commands 回写新 scope 候选待补跑。                                   |
| C3 三端与敏感数据           | partial；局部通过 | 缺真实应用拒绝序列、关闭期间晚到状态、多实例敏感 diff 摘要/清理以及独立 typed 消费；不能用 100% wrapper coverage 证明 core 历史数据安全。                                  |
| C4 React 生命周期与竞态     | partial；局部通过 | Angular 实际组件销毁/子 provider、多实例；React StrictMode/多 root/旧库 pending（新 probe 未跑）；Vue provider ref 替换与 SFC scope/晚到命令，均未完整证明。               |
| C5 React 类型与 render 边界 | partial；局部通过 | Angular 模板/route、React 独立 typed consumer + StrictMode 错误 props、Vue vue-tsc/SFC readonly/emits pack consumer 未完整验证；root resolve 是路径证据而非声明/运行证明。 |

本轮完成条件：

- [x] 全受控 inventory / 摘要核对，未排除配置/资源/fixture。
- [ ] 全部受控内容阅读及全部原 C 场景核销（缺口见表，保持 partial）。
- [x] 每 C 已有明确的已证/未证结论及角色明确的源码、测试锚点。
- [x] 当前 baseline 的 unit / 四指标 / 零警告 lint / typecheck / 真 pack 来源已读取登记。
- [ ] 晚加探针补跑、独立 typed/runtime consumer、真实完整 UI/生命周期等必要缺口全部关闭。
- [ ] 全对象证据完成与最终评级（不要求零缺陷，但不能缺验证）；尚未完成。

本对象四指标（statements/branches/functions/lines）：**100% / 100% / 100% / 100%**；阈值各项 ≥ 80%。其余18包的绿不能抹掉 rxdb-angular 的16个失败；新探针不继承基线通过。
发布 pack 根是 `packages/rxdb-plugin-working-tree-react`，实际 tarball 目标文件存在、独立根 ESM 解析通过；**不包含 typed consumer 编译/runtime import**。Angular 不能按源 manifest 缺 exports 报错。

逐 C 原场景、函数/测试证据与完成条件详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-working-tree-react.md`；机器证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/c-evidence.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。
