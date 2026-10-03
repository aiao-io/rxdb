---
kind: review-plan
title: packages 与 apps 全仓深度评审计划
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# packages 与 apps：全仓深度评审计划

✅ **值得做。** 目标是建立可执行、可追溯的全范围评审路线，不做“看了几个入口就全绿”的形式审查。此文件定义评审路线；实际执行范围、确认问题与未执行项另见 [代码评审执行台账](execution-2026-10-03.md)。目前只完成部分专题复核，不宣称全仓已审完或覆盖率达标。

## 1. 范围、基线与数量

- 基线：`main@2e820521187cbfcd1fe76fb705659fea0a548f0e`；盘点时间：**2026-10-03（Asia/Shanghai）**。
- 范围以物理目录、Git 受控文件和 Nx resolved project graph 交叉核对；不能只按可发布 npm 包或只按 `type=app` 筛选。
- `packages/`：**50 个有效源码包**，另有 **1 个 `rxdb-adapter-desktop` 本机残留目录**。
- `apps/`：**19 个应用项目**，包含 10 个运行应用/服务/扩展与 9 个 E2E 项目；以本清单为准，不因名字包含 `e2e` 而排除。
- 逐对象计划：**70 份**（51 份 packages 文档，其中 1 份残留范围核查；19 份 apps 文档）。另有本总计划，共 **71 份新增 Markdown**；已有 README 只增加索引。
- 纳入各对象全部受控源码、配置、fixture、测试、构建/打包文件、原生 Rust、SQL 与资源声明；发布产物在执行阶段由当前源码构建后检查，不审旧 `dist`。
- 本机 `packages/rxdb-adapter-desktop/` 无受控源码、无 `package.json`、无 Nx node；不能算第 51 个有效包，不能执行旧产物，也不擅自删除残留。

盘点中的“测试文件”只统计 `.spec / .test / .suite` JS/TS 文件名，含共享套件，不代表用例数、覆盖率或实际运行。Rust inline tests、外部共享套件、生成消费者类型测试须在对应计划继续查实。

### 范围外的集成链路

以下对象没有本次独立评审文档，但必须作为消费者/协议链路追踪，不能因目录名不在范围内而截断调用：

- [`modules/rxdb-devtools-panel`](../../modules/rxdb-devtools-panel)
- [`modules/recipes-domain`](../../modules/recipes-domain)
- [`modules/angular-todo`](../../modules/angular-todo)
- [`modules/angular`](../../modules/angular)
- [`modules/wujie`](../../modules/wujie)

`website/`、`benchmarks/` 以及根脚本不作为新增逐对象评审范围；涉及 API 文档、门禁、性能证据或发布配置时，只联查与被审对象相关的链路。需求尚在 Backlog / 未承诺的能力不强行当现有实现验收，但已声明的用户行为必须核实。

## 2. 执行波次与排期策略

| 波次 | 主题                 | 范围                                             | 对象数量                                           | 交付/退出条件                                                                   |
| ---- | -------------------- | ------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| W0   | 可信测试根与范围     | utils、rxdb-test、client-generator、desktop 残留 | 4 个 packages 对象 / 0 个 apps 对象（含 1 个残留） | 确认测试判别力、生成来源、发布/依赖方向与有效范围；先建立后续评审可信输入。     |
| W1   | 核心契约             | rxdb、sqlite-core                                | 2 个 packages 对象 / 0 个 apps 对象                | 确认连接/事务/捕获/查询/迁移与 driver 不变量，形成适配器共享基线。              |
| W2   | 适配器与真实宿主     | 全部有效 adapter（sqlite-core 除外）             | 11 个 packages 对象 / 0 个 apps 对象               | 对齐同一行为契约，逐宿主验证拒绝、错误、持久化、协议与安全边界。                |
| W3   | 插件内核与调试协议   | 插件内核、rxdb-devtools                          | 11 个 packages 对象 / 0 个 apps 对象               | 校验写捕获、同步、草稿、分支、历史、文件与调试协议的组合及负向边界。            |
| W4   | 模型、编辑器与三框架 | model、code-editor 及 Angular/React/Vue 封装     | 23 个 packages 对象 / 0 个 apps 对象               | 对齐功能/API 语义与类型，分别复验框架生命周期、竞态、响应式来源与无障碍。       |
| W5   | 应用与发布档位       | 运行应用、HTTP server、DevTools extension        | 0 个 packages 对象 / 10 个 apps 对象               | 审真实用户路径、初始化/清理、凭证/权限、资源和 dev/release 隔离。               |
| W6   | E2E 可信度与补证     | 全部 9 个 E2E 应用项目                           | 0 个 packages 对象 / 9 个 apps 对象                | 验证产物来源、fixture 隔离、断言强度、关键旅程及真实平台；回填 W1–W5 未验证项。 |

波次是评审先后和风险收束顺序，**不是替代 Nx 依赖执行顺序的拓扑表**。测试/生成器也消费核心契约，实际构建按 resolved graph 的 `dependsOn` 执行。每波先完成静态梳理，再取真实运行证据；上游未验证项向下游传递，不能靠下游 mock 测试清零。

先试评 `rxdb`、一个 SQLite 宿主和一组三框架封装，按真实文件规模、协议/运行时数量、环境准备成本校准人日，再分配各波负责人；不要对 70 个对象做未经测量的统一工期承诺。单包计划中的入口是导航，不是“只审这些文件”的缩减范围。

### 每个对象的固定流程

1. **范围与契约**：锁定 SHA、全部受控文件、公开入口、API baseline、能力矩阵、依赖/消费者、支持/不支持档位。
2. **数据结构与状态机**：画持久化结构、身份/版本/水位、所有权、连接/事务/订阅/插件生命周期；先找不变量，再看特殊分支。
3. **专项和组合审查**：逐项执行独立计划的 C 编号任务，追到真实上下游；审失败窗口、并发、取消、权限与边界输入，不为未知错误加 fallback。
4. **测试可信度与动态复验**：检查断言、skip、mock 边界、fixture 隔离，再用实际 Nx targets 运行；缺环境标未验证，失败先串行隔离。
5. **兼容性与成本**：对照公开类型、三框架、多宿主、实际用户路径和发布产物；性能/复杂度主张用规模和测量数据支持。
6. **结论与分流**：按证据定 🟢 / 🟡 / 🔴，问题去重归属根因，记录 P0–P3、最小修法、失败测试和跨对象补证；评审不是顺手大重构。

## 3. 共用评审标准

| 维度           | 必须回答的问题                                                                            | 最低证据                                                                        |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 契约与兼容性   | 是否破坏公开 API、用户可见行为、持久化数据或已声明的能力？哪些档位明确不支持？            | exports/类型/consumer 编译、API baseline、当前能力说明与真实调用方              |
| 质量与类型     | TS strict 是否覆盖生产/测试/生成面？是否用 any、宽化断言、eslint-disable 或警告掩盖错误？ | resolved targets、tsconfig/ESLint include-exclude、类型负例、TSDoc 与实际返回值 |
| 结构与简洁     | 数据结构能否消除特殊情况？是否职责混杂、>3 层嵌套、重复状态、隐藏 fallback？              | 源码符号、状态/所有权图、根因与最小修法；不是审美驱动重写                       |
| 生命周期与并发 | 启动失败、取消、断连、重订阅、卸载、过期响应、重复提交是否可靠收束？                      | 状态迁移及资源清单、反向场景、失败窗口/竞争的动态复现                           |
| 持久化与一致性 | 事务提交、事件、水位、schema 迁移、备份/恢复、文件双存储是否有错误承诺？                  | 真实 backend/宿主日志、故障注入、重启后读回；明确 crash-safe 等能力边界         |
| 安全与隐私     | 输入、SQL、路径、消息身份、IPC、CSP、凭证、历史/录制敏感数据是否跨越权限边界？            | 从入口到副作用的追踪与拒绝路径；不能只靠 UI 禁用或 mock                         |
| 性能与资源     | 查询/遍历/分页/物化是否有规模上界？监听、worker、缓存、文件与内存是否回收？               | 注明数据量/设备/运行时的基线与测量；先证实真实问题，不随意设预算                |
| 框架与可访问性 | 同功能/API 是否三端齐全？各框架 lifecycle、响应式来源、键盘/focus 与状态可感知是否正确？  | 同语义输入输出对照、类型 consumer、框架特有生命周期与真实 UI 场景               |
| 测试判别力     | 测试是否真正调用生产链路、覆盖拒绝/失败/并发、可隔离且可重复？                            | 强断言、失败探针、skip/平台矩阵、trace；不存在“有 spec 就算完成”                |
| 构建/发布/文档 | 包入口、声明、WASM/Worker/native 资源、dev/release 隔离与文档承诺是否一致？               | 当前 build 的产物、consumer 编译与宿主运行；区分生成与旧残留                    |

发生修复时遵循红→绿→重构：先补失败测试、证明修复能让测试转绿，再做不改行为的清理。单纯计划/静态发现不能伪造红绿测试记录。JS/TS 的新增注释按仓库规则用中文，API 名、标准 TSDoc 标签及代码示例保留原文。

### 三框架语义联审矩阵

| 功能族         | 必须联审的独立计划                                                                                                                                                                                                                                                                                                 | 对照内容                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| RxDB 基础封装  | [`rxdb`](packages/rxdb.md)、[`rxdb-angular`](packages/rxdb-angular.md)、[`rxdb-react`](packages/rxdb-react.md)、[`rxdb-vue`](packages/rxdb-vue.md)                                                                                                                                                                 | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 实体模型与 UI  | [`rxdb-model`](packages/rxdb-model.md)、[`rxdb-model-angular`](packages/rxdb-model-angular.md)、[`rxdb-model-react`](packages/rxdb-model-react.md)、[`rxdb-model-vue`](packages/rxdb-model-vue.md)                                                                                                                 | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 代码编辑器     | [`code-editor`](packages/code-editor.md)、[`code-editor-angular`](packages/code-editor-angular.md)、[`code-editor-react`](packages/code-editor-react.md)、[`code-editor-vue`](packages/code-editor-vue.md)                                                                                                         | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 搜索           | [`rxdb-plugin-search`](packages/rxdb-plugin-search.md)、[`rxdb-plugin-search-angular`](packages/rxdb-plugin-search-angular.md)、[`rxdb-plugin-search-react`](packages/rxdb-plugin-search-react.md)、[`rxdb-plugin-search-vue`](packages/rxdb-plugin-search-vue.md)                                                 | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 树             | [`rxdb-plugin-tree`](packages/rxdb-plugin-tree.md)、[`rxdb-plugin-tree-angular`](packages/rxdb-plugin-tree-angular.md)、[`rxdb-plugin-tree-react`](packages/rxdb-plugin-tree-react.md)、[`rxdb-plugin-tree-vue`](packages/rxdb-plugin-tree-vue.md)                                                                 | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 工作树         | [`rxdb-plugin-working-tree`](packages/rxdb-plugin-working-tree.md)、[`rxdb-plugin-working-tree-angular`](packages/rxdb-plugin-working-tree-angular.md)、[`rxdb-plugin-working-tree-react`](packages/rxdb-plugin-working-tree-react.md)、[`rxdb-plugin-working-tree-vue`](packages/rxdb-plugin-working-tree-vue.md) | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 回放           | [`rxdb-plugin-replay`](packages/rxdb-plugin-replay.md)、[`rxdb-plugin-replay-angular`](packages/rxdb-plugin-replay-angular.md)、[`rxdb-plugin-replay-react`](packages/rxdb-plugin-replay-react.md)、[`rxdb-plugin-replay-vue`](packages/rxdb-plugin-replay-vue.md)                                                 | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 三框架演示应用 | [`dev-rxdb-angular`](apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](apps/dev-rxdb-vue.md)                                                                                                                                                                                 | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |
| 三框架 E2E     | [`dev-rxdb-angular-e2e`](apps/dev-rxdb-angular-e2e.md)、[`dev-rxdb-react-e2e`](apps/dev-rxdb-react-e2e.md)、[`dev-rxdb-vue-e2e`](apps/dev-rxdb-vue-e2e.md)                                                                                                                                                         | 输入/输出、loading/error、类型、取消/并发、释放、用户行为；保留框架原生表达 |

该矩阵是当前存在的封装族，不要求为没有公开封装的插件凭空新建三份 API。其他插件通过核心/模型/应用入口验证实际可见功能；是否缺了已承诺的某一端，必须对照当前需求与导出证据判断。

### 核心跨对象链路

- 核心写入 → adapter 事务 → 捕获/事件 → history / working-tree / sync / querycache：覆盖提交/回滚、并发与幂等；不恢复 writer lease 或已删除 `rowsAffectedConformanceSuite`。
- `working-tree` 是历史/分支/捕获；`workspace` 是 NEW 未入库草稿；`replay` 是显式录制与独立会话库。边界不能因名字相近而混用，恢复也不能偷换成 checkout。
- HTTP adapter ↔ HTTP server ↔ client app/E2E：分页 token、ETag、SSE、离线写、CORS 与失败响应完整闭环。
- Supabase adapter ↔ sync ↔ app/E2E：本地与远端环境分开；凭证、RLS/身份边界、确认水位与隔离资源逐项复验。
- SQLite core ↔ WASM/Worker/小程序/Electron/Tauri：共享 conformance 只能证明其实际执行场景，不能自动外推到未运行的宿主。
- DevTools provider ↔ 面板 ↔ extension/桌面 bridge：身份、能力、请求关联、会话旋转、队列、敏感数据及生产隔离端到端验证。
- storage ↔ metadata DB ↔ OPFS/native filesystem ↔ UI：双存储失败窗口、路径/锁、安全与撤销/清理，不声称不存在的跨存储事务。

## 4. 运行环境、任务与覆盖率门禁

### 运行纪律

```bash
NX_DAEMON=false pnpm nx show projects --json
NX_DAEMON=false pnpm nx graph --print
```

- 每份计划的任务表来自基线 Nx resolved config，含推断目标；执行前用 `pnpm nx show project` 复核。不存在的 target 不猜、不补假命令。
- 本地任务使用 `CI=true NX_DAEMON=false`，`--skipRemoteCache` 关闭远端缓存，首轮 `--parallel=1`。这不等于 Vitest fork 已串行，崩溃时再按实际配置收敛 worker，不能猜 CLI 参数。
- 初筛可命中本地缓存，但动态结论/缺陷复现需 `--skipNxCache` 并记录新日志；缓存命中、静态推断、真实运行分别标注。
- `pnpm test-all` 是 `nx affected`，不是全目录全目标测试；`run-many` 未运行没有同名目标的项目也不代表这些对象被验证。全范围以 70 个对象完成条件逐项核销。
- 失败先看 Failed tasks，独立串行复跑；EPIPE / worker 崩溃 / service stopped 与业务失败分开。Electron typecheck 的历史 flaky 不是当前稳定错误的豁免。
- Docker/Supabase、微信 DevTools、Electron、Tauri/Rust/WebView、OPFS/browser 都要求真实隔离宿主。缺环境、缺权限、skip 或只用 mock 必须记录未验证；禁止用一个宿主替代所有平台。
- 任务可能通过 dependsOn 执行 build、test-env 或打包，执行前确认副作用；不默认运行 seed/reset、发布、更新或生产数据 mutation。

### 覆盖率与测试结论

| 对象                                        | 目标                                         | 证据限制                                                                        |
| ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| rxdb / rxdb-angular / rxdb-react / rxdb-vue | 四指标分别 ≥90%                              | 核心包不以总平均替代 branches/functions；逐配置核对生产覆盖面                   |
| 其他公开 packages                           | 四指标分别 ≥80%                              | 对应真实 runtime 与当前 SHA；检查未覆盖文件、include/exclude 和只测 mock 的空洞 |
| rxdb-test                                   | coverage-acceptance 专用合并，四指标 ≥80%    | 通用 audit:coverage 排除它；自身普通 test 不能证明发布共享套件被消费者执行      |
| sqlite-core / 配置专用 coverage 的项目      | 优先实际 coverage-acceptance / coverage 流程 | 保留不同 backend/browser 段的来源与合并证据，不把 Node summary 代证浏览器       |
| 运行 apps / server / extension              | 生产代码四指标 ≥80% 的评审目标               | 不是声称已存在应用硬门禁；前端与 native 分开测量，缺配置/数据明确登记           |
| E2E 项目                                    | 用户旅程、反向场景、宿主/平台与 skip 矩阵    | 用例文件数不折算生产覆盖率；只启动/截图不等于业务断言                           |
| desktop 残留目录                            | 覆盖率不适用                                 | 没有受控源码；不从本机旧 dist 取验收数字                                        |

四指标指 `statements / branches / functions / lines`。对照 [覆盖率门禁实现](../../scripts/audit/coverage-check.mjs) 与项目配置；`pnpm audit:coverage` 只读取已生成 summary，不会替你跑测试。当前所有对象覆盖率均未测量。本计划不允许拿旧 artifact、忽略缺失 summary、选择性 include 或 blanket skip 获得假绿。

专项目标不能漏：`test-node`、`test-browser`、`coverage-acceptance`、Tauri 的 Rust/conformance 与 smoke、微信的 `e2e-devtools`、扩展 prepare、Supabase 的隔离 test-env / remote 档、当前 build 后的 audit-secrets、桌面 audit-lazy-backend。实际命令都在对应独立计划中，不用一条通用命令掩盖宿主差异。

## 5. 证据、严重度与成果规范

### 证据分级

| 标记     | 可以得出的结论                                | 必须记录                                                             |
| -------- | --------------------------------------------- | -------------------------------------------------------------------- |
| 静态证据 | 源码/配置当前路径成立；不能冒充真实环境已通过 | SHA、文件/符号或短代码引用、调用链/不变量；不只写裸行号              |
| 动态通过 | 指定运行环境和场景的本轮通过                  | 完整命令、依赖配置、宿主/平台/数据规模、日志/trace、用例与 skip 清单 |
| 确认问题 | 静态确定的矛盾或可重复失败，影响范围清楚      | 输入/步骤、预期/实际、根因锚点、复验方法；并发假失败先隔离           |
| 未验证   | 缺环境、证据、测量或覆盖；不能据此判通过      | 缺什么、为何缺、受影响结论、补证场景/所需宿主与下一步                |
| 不适用   | 当前公开能力明确不涉及该项                    | 能力/需求/导出依据；不是“太难/没时间”的替代说法                      |

按照 [文档写作规范](../CONVENTIONS.md) 写当前可验证结论；需求文档只给验收契约，不是实现已存在的证明。

### 严重度与评级

| 等级 | 判定原则                                              | 处理策略                                                        |
| ---- | ----------------------------------------------------- | --------------------------------------------------------------- |
| P0   | 有证据的严重数据破坏、权限绕过/敏感泄漏或全局不可用   | 立即标出影响及停止受影响发布/操作的理由，优先失败复现与最小修复 |
| P1   | 主要能力稳定失效、事务/持久化/迁移错误、明显兼容破坏  | 高优先级修复与跨对象回归；不靠 fallback 吞错                    |
| P2   | 有界边缘场景、性能/资源/类型/可访问性缺陷，有明确影响 | 记录触发条件、成本与最小修法，避免扩成重构项目                  |
| P3   | 不影响现有能力的小型一致性/维护/文档问题              | 确认值得做再排期；纯偏好不作为缺陷                              |

- 🟢 **好**：覆盖了约定范围与必要运行证据，没有未分流的重大风险；说明仍未运行的平台，不能给“所有环境安全”的绝对保证。
- 🟡 **凑合**：结构/功能可用但有确认缺陷或关键补证，逐项说明影响与限制。
- 🔴 **垃圾**：已证实基础契约、安全或数据完整性失守；给证据与最小改进，不靠措辞替代分析。
- 计划中的“高/中风险”只是评审优先度，既不是 P 等级，也不是代码好坏判断。未验证对象不得标全绿。

### 成果与去重

每个独立计划按 C 编号登记证据/结论并核销完成条件；不要把未确认猜测直接写成缺陷。确认问题再按 [既有 review 模板](review.template.md) 建 RV 记录，沿用 README 的编号/清理约定。报告至少写问题与影响、证据/复现、根因、最小修法、回归场景以及关联包/应用；同一根因只建一条主记录，由其他计划引用，不复制多份问题。

评审计划不占用 `RV-*` 编号，不混用问题报告的 Open/Resolved 状态；计划不会因问题修复而删除。已有报告清理仍沿原规则处理，不能为了建立新计划抹掉历史未处理项。

评审完成与发布就绪分开：范围、证据、失败/未验证归属和问题分流全部闭合才算评审完成；仍有阻断缺陷或缺关键运行证据时，不能据此宣布修复完成或可发布。

## 6. 全量对象索引

### 6.1 有效 packages：50 个

| 对象 / 独立计划                                                                    | 波次 | 优先风险 | 受控文件 | 测试文件 | 已确认评审目标                                                                                                           |
| ---------------------------------------------------------------------------------- | ---- | -------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`code-editor`](packages/code-editor.md)                                           | W4   | 中       | 20       | 5        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`code-editor-angular`](packages/code-editor-angular.md)                           | W4   | 中       | 17       | 2        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`code-editor-react`](packages/code-editor-react.md)                               | W4   | 中       | 13       | 2        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`code-editor-vue`](packages/code-editor-vue.md)                                   | W4   | 中       | 20       | 7        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb`](packages/rxdb.md)                                                         | W1   | 高       | 277      | 125      | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-electron`](packages/rxdb-adapter-electron.md)                       | W2   | 高       | 76       | 38       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-encrypted`](packages/rxdb-adapter-encrypted.md)                     | W2   | 高       | 37       | 14       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-http`](packages/rxdb-adapter-http.md)                               | W2   | 高       | 37       | 13       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-miniprogram`](packages/rxdb-adapter-miniprogram.md)                 | W2   | 高       | 43       | 15       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-pglite`](packages/rxdb-adapter-pglite.md)                           | W2   | 高       | 240      | 165      | `lint`、`typecheck`、`test`、`build`、`test-node`                                                                        |
| [`rxdb-adapter-sqlite`](packages/rxdb-adapter-sqlite.md)                           | W2   | 高       | 33       | 13       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-sqlite-core`](packages/rxdb-adapter-sqlite-core.md)                 | W1   | 高       | 174      | 85       | `lint`、`typecheck`、`test`、`build`、`coverage-acceptance`                                                              |
| [`rxdb-adapter-sqlite-wasm`](packages/rxdb-adapter-sqlite-wasm.md)                 | W2   | 高       | 50       | 26       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-sqliteai`](packages/rxdb-adapter-sqliteai.md)                       | W2   | 高       | 35       | 11       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-adapter-supabase`](packages/rxdb-adapter-supabase.md)                       | W2   | 高       | 65       | 34       | `lint`、`typecheck`、`test`、`build`、`test-env`                                                                         |
| [`rxdb-adapter-tauri`](packages/rxdb-adapter-tauri.md)                             | W2   | 高       | 54       | 17       | `lint`、`typecheck`、`test`、`build`、`cargo-check`、`cargo-clippy`、`cargo-test`、`build-test-host`、`test-conformance` |
| [`rxdb-adapter-wa-sqlite`](packages/rxdb-adapter-wa-sqlite.md)                     | W2   | 高       | 49       | 21       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-angular`](packages/rxdb-angular.md)                                         | W4   | 高       | 36       | 13       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-client-generator`](packages/rxdb-client-generator.md)                       | W0   | 高       | 76       | 38       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-devtools`](packages/rxdb-devtools.md)                                       | W3   | 高       | 114      | 47       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-model`](packages/rxdb-model.md)                                             | W4   | 中       | 113      | 46       | `lint`、`typecheck`、`test`、`build`、`coverage`                                                                         |
| [`rxdb-model-angular`](packages/rxdb-model-angular.md)                             | W4   | 中       | 63       | 13       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-model-react`](packages/rxdb-model-react.md)                                 | W4   | 中       | 62       | 14       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-model-vue`](packages/rxdb-model-vue.md)                                     | W4   | 中       | 60       | 14       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-graph`](packages/rxdb-plugin-graph.md)                               | W3   | 高       | 52       | 17       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-history`](packages/rxdb-plugin-history.md)                           | W3   | 高       | 62       | 25       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-querycache`](packages/rxdb-plugin-querycache.md)                     | W3   | 高       | 31       | 12       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-replay`](packages/rxdb-plugin-replay.md)                             | W3   | 高       | 42       | 15       | `lint`、`typecheck`、`test`、`build`、`test-browser`、`coverage`                                                         |
| [`rxdb-plugin-replay-angular`](packages/rxdb-plugin-replay-angular.md)             | W4   | 中       | 15       | 2        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-replay-react`](packages/rxdb-plugin-replay-react.md)                 | W4   | 中       | 11       | 1        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-replay-vue`](packages/rxdb-plugin-replay-vue.md)                     | W4   | 中       | 13       | 1        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-search`](packages/rxdb-plugin-search.md)                             | W3   | 高       | 81       | 40       | `lint`、`typecheck`、`test`、`build`、`test-browser`、`coverage`                                                         |
| [`rxdb-plugin-search-angular`](packages/rxdb-plugin-search-angular.md)             | W4   | 中       | 16       | 3        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-search-react`](packages/rxdb-plugin-search-react.md)                 | W4   | 中       | 13       | 3        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-search-vue`](packages/rxdb-plugin-search-vue.md)                     | W4   | 中       | 13       | 3        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-storage`](packages/rxdb-plugin-storage.md)                           | W3   | 高       | 43       | 14       | `lint`、`typecheck`、`test`、`build`、`test-browser`、`coverage`                                                         |
| [`rxdb-plugin-sync`](packages/rxdb-plugin-sync.md)                                 | W3   | 高       | 79       | 33       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-tree`](packages/rxdb-plugin-tree.md)                                 | W3   | 高       | 47       | 18       | `lint`、`typecheck`、`test`、`build`、`test-browser`、`coverage`                                                         |
| [`rxdb-plugin-tree-angular`](packages/rxdb-plugin-tree-angular.md)                 | W4   | 中       | 16       | 3        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-tree-react`](packages/rxdb-plugin-tree-react.md)                     | W4   | 中       | 13       | 3        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-tree-vue`](packages/rxdb-plugin-tree-vue.md)                         | W4   | 中       | 13       | 3        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-working-tree`](packages/rxdb-plugin-working-tree.md)                 | W3   | 高       | 151      | 70       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-working-tree-angular`](packages/rxdb-plugin-working-tree-angular.md) | W4   | 高       | 15       | 2        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-working-tree-react`](packages/rxdb-plugin-working-tree-react.md)     | W4   | 高       | 12       | 2        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-working-tree-vue`](packages/rxdb-plugin-working-tree-vue.md)         | W4   | 高       | 14       | 2        | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`rxdb-plugin-workspace`](packages/rxdb-plugin-workspace.md)                       | W3   | 高       | 17       | 4        | `lint`、`typecheck`、`test`、`build`、`test-browser`                                                                     |
| [`rxdb-react`](packages/rxdb-react.md)                                             | W4   | 高       | 33       | 15       | `lint`、`typecheck`、`test`、`build`、`test-browser`                                                                     |
| [`rxdb-test`](packages/rxdb-test.md)                                               | W0   | 高       | 105      | 30       | `lint`、`typecheck`、`test`、`build`、`coverage-acceptance`                                                              |
| [`rxdb-vue`](packages/rxdb-vue.md)                                                 | W4   | 高       | 33       | 12       | `lint`、`typecheck`、`test`、`build`                                                                                     |
| [`utils`](packages/utils.md)                                                       | W0   | 高       | 284      | 117      | `lint`、`typecheck`、`test`、`build`                                                                                     |

### 6.2 apps：19 个（运行应用、服务、扩展及 E2E 均纳入）

| 对象 / 独立计划                                                      | 波次 | 优先风险 | 受控文件 | 测试文件 | 已确认评审目标                                                                                          |
| -------------------------------------------------------------------- | ---- | -------- | -------- | -------- | ------------------------------------------------------------------------------------------------------- |
| [`dev-rxdb-angular`](apps/dev-rxdb-angular.md)                       | W5   | 高       | 212      | 41       | `lint`、`typecheck`、`test`、`build`、`spec-typecheck`                                                  |
| [`dev-rxdb-angular-e2e`](apps/dev-rxdb-angular-e2e.md)               | W6   | 高       | 40       | 30       | `lint`、`typecheck`、`e2e`                                                                              |
| [`dev-rxdb-electron`](apps/dev-rxdb-electron.md)                     | W5   | 高       | 106      | 21       | `lint`、`typecheck`、`test`、`build`、`audit-lazy-backend`                                              |
| [`dev-rxdb-electron-e2e`](apps/dev-rxdb-electron-e2e.md)             | W6   | 高       | 23       | 15       | `lint`、`typecheck`、`e2e`                                                                              |
| [`dev-rxdb-http`](apps/dev-rxdb-http.md)                             | W5   | 高       | 36       | 6        | `lint`、`typecheck`、`test`、`build`                                                                    |
| [`dev-rxdb-http-e2e`](apps/dev-rxdb-http-e2e.md)                     | W6   | 高       | 15       | 8        | `lint`、`typecheck`、`e2e`                                                                              |
| [`dev-rxdb-http-server`](apps/dev-rxdb-http-server.md)               | W5   | 高       | 25       | 4        | `lint`、`typecheck`、`test`                                                                             |
| [`dev-rxdb-miniprogram`](apps/dev-rxdb-miniprogram.md)               | W5   | 高       | 21       | 0        | `lint`、`typecheck`、`build`                                                                            |
| [`dev-rxdb-miniprogram-e2e`](apps/dev-rxdb-miniprogram-e2e.md)       | W6   | 高       | 14       | 4        | `lint`、`typecheck`、`e2e-devtools`                                                                     |
| [`dev-rxdb-react`](apps/dev-rxdb-react.md)                           | W5   | 高       | 171      | 37       | `lint`、`typecheck`、`test`、`build`                                                                    |
| [`dev-rxdb-react-e2e`](apps/dev-rxdb-react-e2e.md)                   | W6   | 高       | 36       | 29       | `lint`、`typecheck`、`e2e`                                                                              |
| [`dev-rxdb-supabase`](apps/dev-rxdb-supabase.md)                     | W5   | 高       | 57       | 10       | `lint`、`typecheck`、`test`、`build`、`audit-secrets`                                                   |
| [`dev-rxdb-supabase-e2e`](apps/dev-rxdb-supabase-e2e.md)             | W6   | 高       | 8        | 2        | `lint`、`typecheck`、`e2e`、`e2e-remote`                                                                |
| [`dev-rxdb-tauri`](apps/dev-rxdb-tauri.md)                           | W5   | 高       | 121      | 32       | `lint`、`typecheck`、`test`、`build`、`cargo-check`、`cargo-clippy`、`cargo-test`、`audit-lazy-backend` |
| [`dev-rxdb-tauri-e2e`](apps/dev-rxdb-tauri-e2e.md)                   | W6   | 高       | 17       | 7        | `lint`、`typecheck`、`desktop-smoke`、`devtools-smoke`                                                  |
| [`dev-rxdb-vue`](apps/dev-rxdb-vue.md)                               | W5   | 高       | 139      | 24       | `lint`、`typecheck`、`test`、`build`                                                                    |
| [`dev-rxdb-vue-e2e`](apps/dev-rxdb-vue-e2e.md)                       | W6   | 高       | 36       | 28       | `lint`、`typecheck`、`e2e`                                                                              |
| [`rxdb-devtools-extension`](apps/rxdb-devtools-extension.md)         | W5   | 高       | 38       | 7        | `lint`、`typecheck`、`test`、`build`                                                                    |
| [`rxdb-devtools-extension-e2e`](apps/rxdb-devtools-extension-e2e.md) | W6   | 高       | 9        | 1        | `lint`、`typecheck`、`prepare`、`e2e`                                                                   |

### 6.3 残留范围核查：1 个

| 对象 / 独立计划                                            | 波次 | 优先风险 | 受控文件 | 测试文件 | 已确认评审目标 |
| ---------------------------------------------------------- | ---- | -------- | -------- | -------- | -------------- |
| [`rxdb-adapter-desktop`](packages/rxdb-adapter-desktop.md) | W0   | 范围核查 | 0        | 0        | 无 Nx 项目     |

## 7. 全计划完成条件

- [ ] 50 个有效包、19 个应用和 1 个残留对象都有独立文档并与当前 inventory 一一对应，未遗漏 E2E/server/extension。
- [ ] 每对象全部受控文件及 C 项都有证据结论，未验证/不适用有理由与补证/范围说明。
- [ ] 三框架、SQLite 多宿主、HTTP/Supabase、DevTools 与 storage 等跨对象链路已双向核对。
- [ ] 动态任务、隔离副作用、skip、失败/串行复跑、当轮覆盖率和发布产物来源可追踪，没有缓存/mocks/旧 dist 假绿。
- [ ] 确认问题去重分级、有根因锚点/复验方法/最小修法；未验证能力及发布阻断分别登记。
- [ ] 总结按波次与对象写 🟢 / 🟡 / 🔴、主要风险和下一步；没有将“计划已落盘”包装成“代码已评审/修复”。

## 8. 计划维护与基线参考

- [仓库工程约束](../../AGENTS.md)、[文档证据规则](../CONVENTIONS.md)。
- [能力矩阵](../capability-matrix.md)、[版本/兼容策略](../versioning-policy.md) 与各对象 API baseline。
- [评审目录规则与已有记录](README.md)、[问题模板](review.template.md)。
- 新增/删除/拆分对象、修改公开入口/支持档位或改变 Nx target 后，先同步该对象文档与本索引；未运行过的新基线不能沿用旧“通过”结论。
- 实际进度以 [执行台账](execution-2026-10-03.md) 为准：5 个对象部分执行、65 个未开始、0 个全对象完成；没有批量勾选清单。
