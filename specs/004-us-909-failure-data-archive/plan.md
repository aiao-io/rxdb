# Implementation Plan: US-909 阶段 B — e2e 失败现场数据归档与导入

**Branch**: `us909-stage-b`（特性目录 `004-us-909-failure-data-archive`，PR 叠在 `rrweb` 上） | **Date**: 2026-10-02 | **Spec**: [US-909](../../requirements/stories/future/US-909-session-replay-debugging.md)

**Input**: 没有单独的 spec.md，故事文件即 spec。本 plan 只覆盖阶段 B（AC#4～9），AC#1～3 继续必过。plan 前的第二连接 spike
已通过（[research D1](research.md)），owner 于 2026-10-02 裁决两点：AC#4 改为逻辑不变式；备份窗口内主实例偶发
`database is locked` 接受并写明。

## Summary

Angular e2e 用例失败时，共享 fixture 经页内测试 API 在同一页面起同库名的主线程 IDB 第二连接，`backup()` 原样导出，
归档与摘要作为 test 附件进报告；`dev-rxdb-angular` 新增 `/failure-archive` 导入入口，主线程 IDB 连接在 `connect()` 前把
归档恢复到它的原库名，再经库名覆盖键让应用按 IDB 分支打开，之后用既有 working-tree 页查看未提交条目、在 commit 之间恢复。

1. **共享配置**：从 `setup_rxdb_sqlite-wasm.ts` 抽出实体列表、插件链与主线程 IDB 实例工厂，导出与导入共用（D2）。
2. **页内 API**：`window.__rxdbFailureArchive.{archive, snapshot}`，失败全部折成原因，不抛（data-model §1）。
3. **fixture**：`apps/dev-rxdb-angular-e2e/src/fixtures.ts` 的 auto fixture + `archiveFailure()`；27 个 spec 改从它取 `test`，
   lint 禁止从 `@playwright/test` 直接取 `test`（D10）。
4. **导入**：`/failure-archive` 页 + `rxdb-demo-imported-db-name` 覆盖键 + 外壳提示条（D3、D8）。

## Technical Context

**Language/Version**: TypeScript 6.0 strict + ESM；Angular 22（standalone、OnPush、signals）

**Primary Dependencies**: `@aiao/rxdb`（`RxDB`、`RxDBBackupError`、`RxDBBackupArchiveReader`、`RXDB_DB_NAME_SUFFIX`）、
`@aiao/rxdb/testing`（`cloneEntityClasses`）、`@aiao/rxdb-adapter-sqlite-wasm`、`@aiao/rxdb-adapter-sqlite-core`
（`get_table_name_by_metadata`）、`@aiao/rxdb-plugin-working-tree`；`@playwright/test` 1.63。不加新依赖。

**Storage**: e2e 端口 8200 强制 IDB（`IDBBatchAtomicVFS`，库名 `<dbName>.sqlite`）；归档是 US-217 的备份格式

**Testing**: `dev-rxdb-angular` vitest 单测（纯函数）；`dev-rxdb-angular-e2e` Playwright（`failure-archive.spec.ts`、
`failure-archive-import.spec.ts`）；lint 规则先红后绿；自动触发用临时探针验证，不进交付 PR

**Target Platform**: 浏览器（Chromium，e2e）；本地 macOS + GitHub ubuntu runner

**Project Type**: e2e 基础设施 + demo 应用；不碰 `packages/*`

**Performance Goals**: 失败处理（连接 + 检查 + 备份 + 回传）在 e2e 库上 ≤ 5 s（spike ≈1.25 s）；页内截止 20 s、Node 护栏 25 s
（D5）。通过的用例零额外开销：fixture 只在 `use()` 后判断状态，不起第二连接、不调页内 API。全量 Angular e2e 墙钟与切换前
相比不超过噪声（阶段 A 量测的 off 臂噪声 3.8%），实测记录在 tasks 的验证项里

**Constraints**: 导出前后逻辑不变式（结构文本 + 各表行数 + `status()`）；不吞原始失败、不挤掉 trace；无 fallback——失败按原因
写进摘要，不重试、不降级；只归档用例主 `page` 所在上下文的库

**Scale/Scope**: 27 个 spec 各一行 import；fixture 模块 1 个；dev 应用新增 3 个源文件 + 1 个页面 + 1 个外壳组件，改 setup / 路由 /
菜单；2 个新 e2e spec；单测 1～2 个文件

## Constitution Check

_GATE: Phase 0 前必须通过，Phase 1 设计后复查。_ 依据宪法 v2.0.2。

| 原则        | 检查项                                                                                                                               | 结论 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | :--: |
| I. 代码质量 | `dev-rxdb-angular` 与 `dev-rxdb-angular-e2e` 的 `lint` + `typecheck` 零警告；嵌套 ≤ 3；不用 `any`                                    |  ✅  |
| I. 代码质量 | 无 fallback：manifest 无 `authDomain` 直接报错不猜库名（D3）；导出失败只记原因，不重试、不换通道（D5）                               |  ✅  |
| I. 代码质量 | 失败处理吞异常是 AC#8 的要求（原因进摘要、原始失败不被替换），不是兜底；范围限于 fixture 拆卸                                        |  ✅  |
| I. 代码质量 | 新抽象只有共享配置（D2），理由是第二实例与主实例必须同配置，见 Complexity Tracking                                                   |  ✅  |
| I. 代码质量 | 不碰 `packages/*`，TSDoc 硬性要求不适用；新导出照样写 TSDoc                                                                          | N/A  |
| II. 测试    | TDD：纯函数单测先红；lint 规则先红（27 处）后绿；e2e 先写 spec 再接页内 API                                                          |  ✅  |
| II. 测试    | 确定性：AC#8 的失败用确定的输入制造（护栏 1 ms、截止 1 ms、`maxBytes: 1`），不靠时序竞争；并发锁冲突不做断言（D1，已接受）           |  ✅  |
| II. 测试    | 覆盖率分级只管 `packages/*`                                                                                                          | N/A  |
| III. 三框架 | React / Vue e2e 数据归档在故事 Out of Scope（走 OPFS + Worker，没有主线程绕行）；e2e 基础设施不属于三框架绑定 API                    |  ✅  |
| III. 三框架 | 导入页定义 loading（`importing`，`aria-busy`）/ empty（`idle`）/ error（`role="alert"`）；文件输入有 `<label>`；提示条按钮可键盘操作 |  ✅  |
| IV. 性能    | 失败处理 ≤ 5 s、超时阶梯（D5）；通过的用例零额外开销；默认预算表与 `benchmarks/` 只管 `packages/*`                                   |  ✅  |
| 工程护栏    | 技术栈不变；spec（故事）→ plan → tasks → implement；一个 PR 只交付阶段 B；探针不进交付 PR                                            |  ✅  |

**设计后复查**：Phase 1 只引入 Complexity Tracking 里的一项抽象，没有新依赖与 fallback，结论不变。

## Project Structure

### Documentation (this feature)

```text
specs/004-us-909-failure-data-archive/
├── plan.md          # 本文件
├── research.md      # Phase 0：D1–D10 决策（含 spike 数据与 owner 裁决）
├── data-model.md    # Phase 1：页内 API、附件、摘要、fixture、覆盖键、导入页状态
├── quickstart.md    # Phase 1：AC#4～9 验证步骤
└── tasks.md         # Phase 2（/speckit-tasks）
```

### Source Code (repository root)

```text
apps/dev-rxdb-angular/src/app/
├── rxdb/
│   ├── setup_rxdb_sqlite-wasm.ts            # 改：用共享配置；读覆盖键；安装页内 API
│   ├── demo-rxdb-config.ts                  # 新：DEMO_ENTITIES、useDemoPlugins、createMainThreadIdbRxDB（D2）
│   ├── failure-archive.ts                   # 新：纯函数（原因映射、sink 上限、base64、manifest → 库名、业务表）
│   ├── failure-archive.spec.ts              # 新：上面纯函数的单测
│   └── failure-archive-api.ts               # 新：installFailureArchiveApi（archive / snapshot）
├── pages/failure-archive/
│   ├── failure-archive.page.ts              # 新：导入页（D8）
│   └── failure-archive.page.html            # 新
├── components/imported-db-banner.ts         # 新：外壳提示条 + 回到默认库
├── components/app-menu.ts                   # 改：菜单项
├── app.routes.ts                            # 改：/failure-archive
└── app.ts                                   # 改：挂提示条

apps/dev-rxdb-angular-e2e/
├── eslint.config.mjs                        # 改：no-restricted-imports（D10）
└── src/
    ├── fixtures.ts                          # 新：test / expect / archiveFailure
    ├── working-tree-utils.ts                # 新：从 working-tree.spec.ts 抽出的面板操作（写 Todo / 提交 / 切标签）
    ├── failure-archive.spec.ts              # 新：AC#4、5、8、9
    ├── failure-archive-import.spec.ts       # 新：AC#7
    └── *.spec.ts（27 个）                   # 改：test 改从 ./fixtures.js 取

requirements/
├── stories/future/US-909-session-replay-debugging.md   # 改：AC#4 口径、spike 结论、锁风险、导入库名澄清、阶段状态
├── status-overview.md / roadmap.md                     # 派生视图同步
```

**Structure Decision**: 页内 API 与共享配置留在 `dev-rxdb-angular`（故事技术笔记：只有 Angular 一端用，React / Vue 扩展时再上提）。
`working-tree-utils.ts` 是把 `working-tree.spec.ts` 里已有的局部 helper 搬出来复用，行为不变。

## 偏离与澄清

- **AC#4「导出前不改动库」→ 逻辑不变式**（owner，2026-10-02）：`connect()` 会重写触发器（`schema_version` / `data_version` 变），
  结构文本与数据不变。故事 AC#4 按此改写。
- **导入恢复到归档原库名**：故事写「新库名」；加密实体绑定 `authDomain`，只能用原库名（D3）。原库名对 dev 应用而言就是新库，
  故事技术笔记按此澄清，不改 AC#7。
- **并发锁风险**：备份窗口内主实例写入偶发 `database is locked`，接受（owner，2026-10-02），故事与 fixture TSDoc 写明。

## Complexity Tracking

| 新增                           | 为什么需要                                                                                        | 更简单的方案为什么不行                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `demo-rxdb-config.ts` 共享配置 | 第二实例必须与主实例同实体、同插件，否则结构指纹不同、`#assertClaimedCapabilities` 拒开或补写迁移 | 在页内 API 里手抄一份插件链：spike 就是这么做的，两份列表迟早漂移，漂移的后果是归档不可导入 |
