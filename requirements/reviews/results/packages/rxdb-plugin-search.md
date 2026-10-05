---
kind: review-execution
object: rxdb-plugin-search
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-search：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

FTS5/PG 搜索 backend、scope、索引安装与响应式 SearchHandle 状态机。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-search/src/core/search-engine.ts`](../../../../packages/rxdb-plugin-search/src/core/search-engine.ts)
- [`packages/rxdb-plugin-search/src/core/search-handle.ts`](../../../../packages/rxdb-plugin-search/src/core/search-handle.ts)
- [`packages/rxdb-plugin-search/src/core/scope-resolver.ts`](../../../../packages/rxdb-plugin-search/src/core/scope-resolver.ts)
- [`packages/rxdb-plugin-search/src/core/query-compiler.ts`](../../../../packages/rxdb-plugin-search/src/core/query-compiler.ts)
- [`packages/rxdb-plugin-search/src/backend/backend-registry.ts`](../../../../packages/rxdb-plugin-search/src/backend/backend-registry.ts)
- [`packages/rxdb-plugin-search/src/core/fts5-installer.ts`](../../../../packages/rxdb-plugin-search/src/core/fts5-installer.ts)
- [`packages/rxdb-plugin-search/package.json`](../../../../packages/rxdb-plugin-search/package.json)
- [`packages/rxdb-plugin-search/project.json`](../../../../packages/rxdb-plugin-search/project.json)
- [`packages/rxdb-plugin-search/src/index.ts`](../../../../packages/rxdb-plugin-search/src/index.ts)

| target         | 当前证据                      | 日志                                                            |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| `lint`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)         |
| `typecheck`    | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt)    |
| `test`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)         |
| `build`        | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)        |
| `test-browser` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test-browser.txt) |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 能力与索引安装：核查 backend registry、adapter guard、schema validator、FTS 安装与 plugin inject。
- [ ] C2 查询编译与安全：审查 FTS5/PG 语法、参数绑定、复杂输入与 snippet；搜索词不能改变 SQL 结构。
- [ ] C3 scope 与 branch 隔离：追踪 collection/entity/branch 与选项 identity，跨数据库 handle 不得共用结果。
- [ ] C4 响应式竞态与分页：检查 debounce、异步请求取消、state/error/hasMore、loadMore/clear 和过期响应。
- [ ] C5 跨 backend 排名契约：对照 FTS5 与 PG 的结果映射、aggregator、tie-break 和已有语义差异。
- [ ] C6 三端与可访问性：对照三端 search wrappers 与应用 shared parity/a11y 测试。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

四指标合并后已通过 80% 门禁，见 [合并门禁](../../evidence/2026-10-03/full-run/merged-coverage-gate.txt)；不代表全部 C 项完成。

## 2026-10-05：plugins 并行源码深审与逐 C 交付

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
