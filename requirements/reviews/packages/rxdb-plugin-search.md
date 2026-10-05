---
kind: review-plan
object: rxdb-plugin-search
source_root: packages/rxdb-plugin-search
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-search：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

FTS5/PG 搜索 backend、scope、索引安装与响应式 SearchHandle 状态机。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-search`](../../../packages/rxdb-plugin-search)        |
| Nx 项目             | `rxdb-plugin-search`                                                         |
| npm 名称            | `@aiao/rxdb-plugin-search`                                                   |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 81 个；测试/共享套件入口 40 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/core/search-engine.ts`](../../../packages/rxdb-plugin-search/src/core/search-engine.ts)
- [`src/core/search-handle.ts`](../../../packages/rxdb-plugin-search/src/core/search-handle.ts)
- [`src/core/scope-resolver.ts`](../../../packages/rxdb-plugin-search/src/core/scope-resolver.ts)
- [`src/core/query-compiler.ts`](../../../packages/rxdb-plugin-search/src/core/query-compiler.ts)
- [`src/backend/backend-registry.ts`](../../../packages/rxdb-plugin-search/src/backend/backend-registry.ts)
- [`src/core/fts5-installer.ts`](../../../packages/rxdb-plugin-search/src/core/fts5-installer.ts)
- [`README.md`](../../../packages/rxdb-plugin-search/README.md)
- [`package.json`](../../../packages/rxdb-plugin-search/package.json)
- [`project.json`](../../../packages/rxdb-plugin-search/project.json)
- [`src/index.ts`](../../../packages/rxdb-plugin-search/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-search/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-search/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-search.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb-adapter-pglite: workspace:*`、`@aiao/rxdb-adapter-sqlite-wasm: workspace:*`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                 | 核查动作                                                                           | 最低复验场景 / 证据要求                                                               | 状态                                                  |
| ---- | -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| C1   | 能力与索引安装       | 核查 backend registry、adapter guard、schema validator、FTS 安装与 plugin inject。 | 无 FTS、错 schema、部分安装失败、重连、插件缺失；不退成另一种搜索语义。               | partial / 待证（2026-10-05；见第 8 节）               |
| C2   | 查询编译与安全       | 审查 FTS5/PG 语法、参数绑定、复杂输入与 snippet；搜索词不能改变 SQL 结构。         | 引号/运算符、超长输入、空词、中文/Unicode、恶意 snippet；安全渲染与可解释错误。       | partial / 待证（2026-10-05；见第 8 节）               |
| C3   | scope 与 branch 隔离 | 追踪 collection/entity/branch 与选项 identity，跨数据库 handle 不得共用结果。      | 排除 collection、跨分支、scope 改变、同名实体不同库；旧结果不串库。                   | partial / 待证（2026-10-05；见第 8 节）               |
| C4   | 响应式竞态与分页     | 检查 debounce、异步请求取消、state/error/hasMore、loadMore/clear 和过期响应。      | 快速改词、清空中请求、并发 loadMore、数据更新/删除、末页；状态机完整且不重复/漏结果。 | partial / 已分流候选、仍待证（2026-10-05；见第 8 节） |
| C5   | 跨 backend 排名契约  | 对照 FTS5 与 PG 的结果映射、aggregator、tie-break 和已有语义差异。                 | 同一中英文 fixtures、相同 rank、多个匹配字段、索引刷新；不能把后端差异藏在 UI。       | partial / 待证（2026-10-05；见第 8 节）               |
| C6   | 三端与可访问性       | 对照三端 search wrappers 与应用 shared parity/a11y 测试。                          | 同一输入序列得到同结果/错误/加载状态，键盘操作与高亮不泄露未转义内容。                | partial / 待证（2026-10-05；见第 8 节）               |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **40** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/backend/backend-registry.spec.ts`](../../../packages/rxdb-plugin-search/src/__tests__/backend/backend-registry.spec.ts)
- [`src/__tests__/backend/pg-query-compiler.spec.ts`](../../../packages/rxdb-plugin-search/src/__tests__/backend/pg-query-compiler.spec.ts)
- [`src/__tests__/backend/pg-backend-integration.spec.ts`](../../../packages/rxdb-plugin-search/src/__tests__/backend/pg-backend-integration.spec.ts)
- [`src/__tests__/backend/pg-fts-contract.spec.ts`](../../../packages/rxdb-plugin-search/src/__tests__/backend/pg-fts-contract.spec.ts)
- [`src/__tests__/backend/pg-search-sql.spec.ts`](../../../packages/rxdb-plugin-search/src/__tests__/backend/pg-search-sql.spec.ts)
- [`src/__tests__/backend/pg-statements.spec.ts`](../../../packages/rxdb-plugin-search/src/__tests__/backend/pg-statements.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-search/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-plugin-search-angular`](rxdb-plugin-search-angular.md)、[`rxdb-plugin-search-react`](rxdb-plugin-search-react.md)、[`rxdb-plugin-search-vue`](rxdb-plugin-search-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**搜索联审**：[`rxdb-plugin-search-angular`](rxdb-plugin-search-angular.md)、[`rxdb-plugin-search-react`](rxdb-plugin-search-react.md)、[`rxdb-plugin-search-vue`](rxdb-plugin-search-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target      | 用途与证据边界                                                         |
| -------------- | ---------------------------------------------------------------------- |
| `lint`         | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`    | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`         | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`        | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `test-browser` | 显式浏览器运行时补证；检查 provider、include、环境与清理。             |
| `coverage`     | 项目专用覆盖率流程；核对是否合并不同运行时、产物是否当轮生成。         |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-plugin-search --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-search:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-search --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-search:coverage --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-search:test-browser --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-search
```

- `test-browser` 与普通 `test` 的运行面分别记录；专用 coverage 流程是否已纳入 browser project 需读配置，未纳入则补独立测量，不拿 Node summary 代证。

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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-search.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 8. 2026-10-05：plugins 实际逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**292 passed /2 failed /0 skip（两红为本组确认候选）**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-search` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

本批红 suite **没有新的 coverage summary**；不读取旧 coverage 目录冒充 fresh。后续 focused/late probe 与 browser 由主控续跑。

### 实际逐 C 核销矩阵

| C   | 核销状态                     | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                                          | 不变量、正向与反证                                                                                                                                                                                                     | 已有/本轮测试证据                                                                                                                                                | 必要缺口或核销边界                                                                                                                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证               | backend/backend-registry.ts:64–90、125–138；schema-validator.ts:54–85；plugin.ts:249–284、471–568；fts5-runtime.ts:96–163 | 不支持/未验证adapter明确拒绝（wa-sqlite非默默回退）；schema预检在资源获取前，按collection bootstrap transaction安装；migration签名与运行对象健康度分开，缺触发器不是仅看记录存在。                                     | registry/schema/fts5-runtime/install-order/plugin-lifecycle 原用例当前仍过；实际整包292 passed/2新红，browser安装集成待续。                                      | 无FTS、部分安装失败、重连的真实SQLite/PGlite完整事务与宿主矩阵未全部收齐，不核销C1。                                                              |
| C2  | partial / 待证               | query-compiler.ts:60–91；search-engine.ts:104–127；result-mapper.ts:48–100                                                | query length/token数/token长度有边界，语法字符拆token、MATCH作为参数；metadata标识符引用，不让词串改SQL。snippet移除内部哨兵、按grapheme截断，输出是文本不是安全HTML声明。                                             | query-compiler/result-mapper/search-engine/PG编译相关原用例当前通过；原search用例仍绿。                                                                          | 本轮尚未逐段深读PG runtime/SQL和三个UI安全渲染源码；长Unicode/恶意snippet的真实后端+渲染全矩阵不足，不把Node测试当完整安全审计。                  |
| C3  | partial / 待证               | scope-resolver.ts:32–62；plugin.ts:299–337、391–450、538–568、612–624                                                     | 候选/excluded/requested显式交集与unknown/空scope错误；performSearch pool闭包属于handle、不跨db全局共享。plugin条目仍以tableName/entityName映射，重连teardown清registration；不能未经复验就宣布namespace/branch全隔离。 | scope-resolver/exclusion/plugin-lifecycle/offline原测试当前通过；namespace adapter物理表来源已追到fts5-installer。                                               | 同名实体不同库、多namespace/branch、旧handle跨reconnect与scope变更的完整真实场景未证明；branch不是search handle独立配置项，不伪造它支持冻结分支。 |
| C4  | partial / 已分流候选、仍待证 | search-handle.ts:108–169、240–269；search-state.ts:101–165；plugin.ts:391–454                                             | 请求pump串行，generation/AbortSignal丢迟到响应，pool分页/refresh会重置；但首屏success同步订阅排队loadMore后clear/destroy直接清pending，遗失waiters。公开返回Promise必须结算的不变量被破坏。                            | 本组 review-parallel-loadmore-settlement.spec.ts 主控实测2 failed/1 passed；原search用例全部仍过。整包292 passed/2 failed、0 skip，候选pending等待主控统一编号。 | 确认缺陷不等于评审不能记录结论，但分页/数据更新/快改词/源error/reconnect等原验收仍未全面动态闭合，因此仍partial，不拿缺陷分流充当完成。           |
| C5  | partial / 待证               | aggregator.ts:40–61；merge-results.ts:25–43；result-mapper.ts:81–100；plugin.ts:428–454                                   | per-field按id取更优rank，跨collection使用RRF位置而非混比较后端原始分值，tie-break为penalty/collection/id；元数据字段与snippet保留。界面不能隐瞒backend词法差异。                                                       | aggregator/merge/search-engine、PG FTS contract和共享search-behavior入口；当前原Node用例仍过。                                                                   | 相同中英fixtures在真实FTS5/PG、相同rank/多字段/索引刷新以及pool扩容的结果序列对照未全部完成，PG源码深读也仍有缺口。                               |
| C6  | partial / 待证               | search-handle.ts:232–269；result-mapper.ts:48–100；公开SearchHandle状态/readonly结果契约                                  | 公共结果浅冻结、状态/error/hasMore拆流，组件销毁必须处理handle；文本snippet不是HTML转义器。三端wrapper和应用a11y属于联审接缝，不能由本包核心门禁自动核销。                                                             | state-machine/public-api和本组reentrant探针当前结果已列；主控framework/editor门禁是另测量面。                                                                    | 本轮未完整阅读三个use-search/UI高亮与键盘实现，实际同输入结果/错误/加载状态和未转义高亮的跨端/a11y证据仍待主控联审。                              |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
