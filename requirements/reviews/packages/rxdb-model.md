---
kind: review-plan
object: rxdb-model
source_root: packages/rxdb-model
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-model：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

框架无关的 metadata 驱动表单、详情、可编辑表格、查询构造和 UI 共享能力。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-model`](../../../packages/rxdb-model)                        |
| Nx 项目             | `rxdb-model`                                                                 |
| npm 名称            | `@aiao/rxdb-model`                                                           |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W4 / 中（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 113 个；测试/共享套件入口 46 个（按文件名，不代表覆盖率）                    |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/entity-capabilities.ts`](../../../packages/rxdb-model/src/entity-capabilities.ts)
- [`src/entity-form/form-data.ts`](../../../packages/rxdb-model/src/entity-form/form-data.ts)
- [`src/entity-form/form-validation.ts`](../../../packages/rxdb-model/src/entity-form/form-validation.ts)
- [`src/entity-table/columns/build-editable-columns.ts`](../../../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts)
- [`src/entity-table/editors/global-overlay-editor.ts`](../../../packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts)
- [`src/entity-detail/detail-tabs.ts`](../../../packages/rxdb-model/src/entity-detail/detail-tabs.ts)
- [`README.md`](../../../packages/rxdb-model/README.md)
- [`package.json`](../../../packages/rxdb-model/package.json)
- [`project.json`](../../../packages/rxdb-model/project.json)
- [`src/index.ts`](../../../packages/rxdb-model/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-model/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-model/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-model.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@visactor/vtable: ~1.26.5`、`@visactor/vtable-editors: ~1.26.5`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号                                                                                                                                                                                                                                                 | 专项                 | 核查动作                                                                         | 最低复验场景 / 证据要求                                                                  | 状态    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| C1                                                                                                                                                                                                                                                   | metadata 到 UI 契约  | 逐字段核对 nullable/readonly/enum/format/relation 与默认值、可编辑性和能力显示。 | 隐藏系统字段、只读字段、不可用操作、未注册关系；UI 不能承诺核心不允许的写入。            | partial |
| C2                                                                                                                                                                                                                                                   | 表单提交与验证       | 核查数据转换、错误归属、NEW/UPDATE 与字段级约束，避免保存时静默丢输入。          | 空值、BigInt/binary/日期、非法 JSON、关系改变、异步保存拒绝；用户输入可恢复。            | partial |
| C3                                                                                                                                                                                                                                                   | 表格、查询与游标     | 审查 editable columns、query builder、分页/排序和 callback 生命周期。            | 相同排序值、可空列、字段切换、保存期间数据刷新、选择跨页；以 repository 结果复验。       | partial |
| C4                                                                                                                                                                                                                                                   | DOM / clipboard 安全 | 核查 overlay editor、图标/SVG、文本格式和剪贴板的注入边界。                      | 恶意 HTML/SVG、粘贴公式/超大数据、portal 卸载、焦点恢复；无注入与悬挂全局 DOM。          | partial |
| C5                                                                                                                                                                                                                                                   | 框架无关与消费       | 对照三端组件调用，检查共享内核是否夹带具体框架依赖、单例或 theme 特例。          | Angular/React/Vue 同 metadata fixtures、独立打包导入、同一编辑器多实例；类型与行为对称。 | partial |
| C6                                                                                                                                                                                                                                                   | 可访问性与性能       | 核查编辑器键盘、弹层 aria、长列表/大表格与对象引用稳定性。                       | 键盘进入/退出、错误提示、1000+ 行滚动、快速切页；先量化耗时/内存，再决定优化。           | partial |
| 共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。 |

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **46** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/entity-table/columns/build-editable-columns.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-table/columns/build-editable-columns.spec.ts)
- [`src/__tests__/entity-table/editors/global-overlay-editor.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-table/editors/global-overlay-editor.spec.ts)
- [`src/__tests__/entity-detail/detail-tabs.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-detail/detail-tabs.spec.ts)
- [`src/__tests__/entity-form/form-data.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-form/form-data.spec.ts)
- [`src/__tests__/entity-table/columns/column-utils.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-table/columns/column-utils.spec.ts)
- [`src/__tests__/entity-table/editors/color-editor.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-table/editors/color-editor.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-model/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)。

Nx 基线图中的直接消费者：[`rxdb-model-angular`](rxdb-model-angular.md)、[`rxdb-model-react`](rxdb-model-react.md)、[`rxdb-model-vue`](rxdb-model-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**实体模型与 UI联审**：[`rxdb-model-angular`](rxdb-model-angular.md)、[`rxdb-model-react`](rxdb-model-react.md)、[`rxdb-model-vue`](rxdb-model-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
| `coverage`  | 项目专用覆盖率流程；核对是否合并不同运行时、产物是否当轮生成。         |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-model --json
CI=true NX_DAEMON=false pnpm nx run rxdb-model:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-model --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-model:coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-model
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-model.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 frameworks 本轮完成条件与实际核查

本轮 `main/worktree@44de1138b4d396fc45d6e76ab60476c40fef2223`，日期 2026-10-05。不是新泛计划，而是对原 C 的实际结论：**0/6 个完整 C、execution 保持 in-progress；结果记录保持 partial；本对象不是全对象完成候选。**

全部 117 个受控文件的范围/摘要已核对，正文片段 7、outline 0、仅导航 3、未人工检查 107；不能将 scope 盘点称为全读。

| 原 C                    | 本轮结论          | 原场景中仍缺的必要证据                                                                                                         |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C1 metadata 到 UI 契约  | partial；局部通过 | extractEntityFields 的完整 metadata/未注册关系规则及每项对应 UI 验证未读完，不能承诺全部写入能力已正确显示。                   |
| C2 表单提交与验证       | partial；局部通过 | parse/format 严格边界、BigInt/binary/date/非法 JSON/关系改变/保存失败的全部测试体与三端 UI 未读完；原输入恢复缺完整证据。      |
| C3 表格、查询与游标     | partial；未验证   | 表格 columns/query/cursor/保存中 refresh/跨页选择未深审；测试 993 passed 与 coverage 不能替代此 C 的真实 repository 场景映射。 |
| C4 DOM / clipboard 安全 | partial；未验证   | overlay/图标/SVG/剪贴板相关实现与恶意 HTML/SVG、公式/大数据粘贴、portal 卸载、焦点恢复场景未读完/未动态复验。                  |
| C5 框架无关与消费       | partial；局部通过 | 全部共享内核（117 文件）、theme/singleton、同 metadata 三端 fixture、独立 typed/runtime pack 导入与同编辑器多实例未完整证明。  |
| C6 可访问性与性能       | partial；未验证   | 没有当前 1000+ 行耗时/内存测量和真实键盘/aria/弹层焦点证据；不以单元覆盖率或“可进一步审查”替代性能结论。                       |

本轮完成条件：

- [x] 全受控 inventory / 摘要核对，未排除配置/资源/fixture。
- [ ] 全部受控内容阅读及全部原 C 场景核销（缺口见表，保持 partial）。
- [x] 每 C 已有明确的已证/未证结论及角色明确的源码、测试锚点。
- [x] 当前 baseline 的 unit / 四指标 / 零警告 lint / typecheck / 真 pack 来源已读取登记。
- [ ] 晚加探针补跑、独立 typed/runtime consumer、真实完整 UI/生命周期等必要缺口全部关闭。
- [ ] 全对象证据完成与最终评级（不要求零缺陷，但不能缺验证）；尚未完成。

本对象四指标（statements/branches/functions/lines）：**94.31% / 86.73% / 94.36% / 95.71%**；阈值各项 ≥ 80%。其余18包的绿不能抹掉 rxdb-angular 的16个失败；新探针不继承基线通过。
发布 pack 根是 `packages/rxdb-model`，实际 tarball 目标文件存在、独立根 ESM 解析通过；**不包含 typed consumer 编译/runtime import**。Angular 不能按源 manifest 缺 exports 报错。

逐 C 原场景、函数/测试证据与完成条件详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-model.md`；机器证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/c-evidence.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json`。
