# BOM 第10步复现与验证

验证日期：2026-10-18。Node 26.12.0 / pnpm 10.34.6 / macOS arm64；浏览器为项目锁定Playwright Chromium revision1248。所有运行任务经Nx；主会话串行调度Nx重任务，各Playwright任务内的worker数另行记录，不使用Nx Cloud。当前分支没有提交或推送。

## 消费入口

```bash
pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue
```

各应用导航“BOM 编辑与展开”进入 `/bom-view`，用独立内存数据库与共享fixture；`?root=performance` 为100个可见节点。三个独立包均导出useBomView/BomTree/BomLineEditor/BomViewBinding，分别使用signal/plain snapshot/readonly shallowRef。错误、编辑、完整性及订阅规则见 [contract](contracts/bom-view-api.md)。

## 已完成的真实验证

| 范围              | 结果                                                      | 复现入口                                                                                                                             |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 路线有效域        | 双后端54/54                                               | `pnpm nx test rxdb-plugin-bom --run src/__tests__/bom-routing-effectivity.spec.ts --coverage=false`                                  |
| 真实查询依赖spike | 10/10                                                     | `pnpm nx test rxdb-plugin-bom --run src/__tests__/bom-view-live.spec.ts --coverage=false`                                            |
| 视图与表单        | 双后端28+2                                                | `pnpm nx test rxdb-plugin-bom --run src/__tests__/bom-view.spec.ts src/__tests__/bom-view-fields.spec.ts --coverage=false`           |
| 生命周期与编辑    | 27/27，含旧SQLite守卫持久升级                             | `pnpm nx test rxdb-plugin-bom --run src/__tests__/bom-view-lifecycle.spec.ts src/__tests__/bom-view-editor.spec.ts --coverage=false` |
| 查询成本回归      | 2/2，两端99条路径不合并、单事务一次子头查询、下一事务重读 | `pnpm nx test rxdb-plugin-bom --run src/__tests__/bom-view-query-cost.spec.ts --coverage=false`                                      |
| 三框架浏览器      | Angular/React/Vue各17/17，共51；最终完整应用回归均通过    | `pnpm nx e2e dev-rxdb-<framework>-e2e --grep='BOM 三框架共享验收' --workers=1`                                                       |
| 原BOM演示         | 23/23                                                     | `pnpm nx e2e dev-rxdb-bom-e2e --grep='BOM demo' --workers=1`                                                                         |
| 最终完整BOM演示   | 24/24，含新联产与原23条，50.9s                            | `/private/tmp/bom-affected-complete3.log`                                                                                            |

实际运行使用`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true`。初期锁定Chromium尚未下载，曾用本机Chrome临时配置；锁定浏览器安装完成后，前轮三端51项通过。新核心元数据曾与旧dist混用导致应用初始化失败，完整依赖构建后修复；没有加入缺Map fallback。早期通过不替代最终完整e2e；最终351任务已通过，首屏失败与修复历史保留在下方。

## 四项覆盖率

| 包                      |   语句 |   分支 |   函数 |     行 |
| ----------------------- | -----: | -----: | -----: | -----: |
| rxdb-plugin-bom-angular | 99.01% |   100% |   100% | 98.66% |
| rxdb-plugin-bom-react   | 89.31% | 87.30% | 95.34% | 92.59% |
| rxdb-plugin-bom-vue     |   100% | 97.36% |   100% |   100% |

上表采用对称性修复后的已验证产物：Angular15/15、React17/17、Vue18/18通过，四项均≥80%，日志`/private/tmp/bom-components-symmetry-green.log`。React aria-selected、Angular/React叶子Space不应toggle及disabled submit保护三处差异已由7条增强行为测试先红后绿，再做最小修复。full3的14/16/18与旧行98.64/90.65%，以及更早98.61/92.92%均为历史轮次，不作为当前值；最终完整351任务及8包严格coverage已通过。

PGlite真实summary/final已从有效本地缓存恢复：13任务、12缓存、791ms，日志`/private/tmp/bom-pglite-final-coverage-restored.log`。严格8包官方coverage逐包执行8次全部EXIT0，证据`/private/tmp/bom-final-coverage-eight-packages.log`；SQLite/PGlite两条趋势软提示保留、均达门槛，baseline未改。早期仅评估rxdb一包的日志不作为8包证据。

搜索首个Node297留为历史；第二批pending竞态auditTime80/0先2红/10绿，再完整Node33文件299/299，Node四项91.13/80.46/94.88/92.80%，红绿日志`/private/tmp/bom-search-pending-{red,green}.log`。搜索最终Node299/299、真实browser6文件52/52均通过，合并四项93.50/84.80/96.80/94.70%已读有效summary核对。

```bash
pnpm nx run-many -t test -p rxdb-plugin-bom-angular,rxdb-plugin-bom-react,rxdb-plugin-bom-vue --parallel=1 --run --coverage --coverage.reporter=text --coverage.reporter=json-summary
```

本轮`/private/tmp/bom-affected-complete3.log`中的核心151文件全部通过，2660条通过、1条既有跳过；当前最终四项语句/分支/函数/行=95.56/92.29/96.16/96.27%，四项均≥90%。数据以`coverage/packages/rxdb/coverage-summary.json`及该轮日志为准。前轮affected的95.50/92.18/96.16/96.21%与此前独立完整轮次95.56/92.29/96.16/96.29%均为历史值，后者证据保留在`/private/tmp/bom-core-full-coverage3.log`。

同轮BOM完整默认套件60文件、886/886通过，已合并52条Reach、49条联产、16条v2集成、6条种子与55条既有导入导出契约；BOM四项为95.05/85.72/96.21/96.56%，均≥80%。SQLite共同层64文件1502通过/21既有跳过，四项94.79/90.09/93.78/95.92%；WA878通过/14既有跳过，Electron1267通过/8既有跳过，Angular基础绑定266/266通过。以上独立验证随后随最终351任务统一通过。

前两轮完整收集分别因querycache与SQLite版本切换的过期mock中止：前者补`prepareUpdate.release`，后者补真实`rxdb.config`；修复后各自205/205、1502通过/21既有跳过，证据为`/private/tmp/bom-querycache-final-green.log`与`/private/tmp/bom-sqlite-core-final-green.log`。第三轮移除`nxBail`完整收集349任务，耗时39m44，166项命中本地缓存；347项通过或使用有效缓存，仅Vue/React两个e2e任务因下方首屏预算失败。联产与原23条合计24条demo已通过；失败控制与整套串行复验另列，不把full3记成首次全绿。

## 性能与体积

```bash
pnpm nx run benchmarks:benchmark-bom
pnpm nx run @aiao/source:audit-bom-bundle
```

主基准固定5轮预热、20轮采样，100节点重新创建任务并等待首份完整快照；另测真实描述保存及save完成到可见新快照。首轮p95为32.782ms/111.840ms，未达16/100ms预算；SQL计数确认99次重复子头查询，已修成本次事务局部去重。重建后20样本复测查询/保存/刷新p95为13.158/1.012/34.660ms，三项全部达标，原始样本已归档至 [bom-view-benchmark.json](../../benchmarks/reports/bom-view-benchmark.json)（命令默认输出的 `bom-latest.json` 被 Git 忽略）。

前轮浏览器各2轮输入预热、20轮输入至DOM样本，首屏耗时/输入p95为React1343.10ms/48.00ms、Angular1172.70ms/18.00ms、Vue853.50ms/12.60ms，仅作为历史轮次保留。当前原始样本与布局保存于`benchmarks/reports/bom-view-{react,angular,vue}-{performance,layout}.json`，其中记录下方最终轮次。后补Angular面板等高断言曾暴露115.5px宿主差异，宿主样式修复后最终三端面板均为468px。

第三轮完整e2e出现两项真实预算失败，阈值仍为100节点首屏<1500ms、输入p95<100ms，未增加重试：

| 应用                 | 完整e2e结果          | Playwright workers | BOM首屏耗时ms | 输入p95 ms | 当前结论                                  |
| -------------------- | -------------------- | -----------------: | ------------: | ---------: | ----------------------------------------- |
| Vue                  | 181通过/1失败，共182 |                  8 |        2504.4 |       10.4 | 仅BOM100节点首屏超1500ms                  |
| React                | 198通过/1失败，共199 |                  8 |        2512.9 |       40.4 | 仅BOM100节点首屏超1500ms                  |
| Angular（full3历史） | 203/203通过，3.0m    |                  2 |        1088.7 |       14.0 | 当次BOM17通过，不能替代下方最新失败及复验 |

失败原始样本分别归档至[Vue 8 workers](../../benchmarks/reports/bom-view-vue-performance-8-workers.json)和[React 8 workers](../../benchmarks/reports/bom-view-react-performance-8-workers.json)。两份报告均为1280×900 viewport、100个可见节点，保留2轮预热及20个输入样本。这里的8是单个Playwright任务内worker数，并非Nx并行度。

冷启动trace可见全局宿主数据库和BOM独立数据库分别初始化WASM，单凭该观察未归因。full3结束后，主会话对未修改的同一构建产物执行`grep=100 节点性能`、`--workers=1`、`excludeTaskDependencies`冷控制：Vue1/1（3.2s）、React1/1（3.1s）通过，日志为`/private/tmp/bom-e2e-performance-control.log`。这说明性能结果受任务内并发影响，不能将原始失败抹去或宣称运行代码已经优化。

随后仅Vue/React的`playwright.config.ts`将workers从`isCI ? 2 : 8`改为1，1500ms首屏/100ms输入阈值及无本地重试保持。独占Nx串行整套复跑中，Vue182/182已通过；React首轮198/199的OPFS取消覆盖失败由目录导航同步修复，定向2/2通过（`/private/tmp/bom-react-opfs-navigation-green.log`）。后一完整React仍198/199，唯一失败变为搜索页clear后旧词复活（`/private/tmp/bom-react-e2e-final-complete.log`）；search-handle首个auditTime修复当次通过Node297，追加pending竞态后的最终Node299见上；完整e2e已由下方最终full验证通过。full3的Angular1088.7/14.0及受保护的2-workers失败/1-worker-control报告均为历史；最终351任务及六份当前JSON见下方最终门禁记录。

体积用TypeScript AST遍历每个入口的相对静态import/export，完整可达再计字面动态import；逐文件gzip(level6)求和，外部peer另列。首次52739、后续53429字节均真实超出50000字节静态预算；拆分按需入口后，最新[体积报告](../../benchmarks/reports/bom-bundle.json)已通过该预算：

| 入口        | 静态依赖gzip字节 | 完整可达gzip字节 |
| ----------- | ---------------: | ---------------: |
| BOM核心     |            49185 |            94194 |
| testing     |            25053 |            25053 |
| Angular绑定 |             4069 |             4069 |
| React绑定   |             2769 |             2769 |
| Vue绑定     |             3715 |             3715 |

外部peer按报告单列；各绑定的数值不重复计入作为peer的BOM核心。完整可达体积照实记录，未将动态分块从总体积中抹去。

## 上一完整full的Angular失败与控制（历史）

| 轮次             | workers | 用例结果       | firstData ms | 输入p95 ms | 结论                            |
| ---------------- | ------: | -------------- | -----------: | ---------: | ------------------------------- |
| full3历史        |       2 | Angular203/203 |       1088.7 |       14.0 | 历史通过                        |
| final-complete   |       2 | Angular202/203 |       1622.6 |       16.1 | 首屏超1500ms，当次完整共享50/51 |
| 同产物单性能控制 |       1 | 1/1            |       1340.0 |       14.7 | 仅定向控制通过，输入max15.1ms   |

失败与控制原始样本分别为[2 workers失败](../../benchmarks/reports/bom-view-angular-performance-2-workers.json)、[1 worker控制](../../benchmarks/reports/bom-view-angular-performance-1-worker-control.json)，两份均保留。控制日志`/private/tmp/bom-angular-performance-control.log`。失败轮次冻结的242个source/config文件未变，控制复用同一产物；不以控制通过改写完整full失败。Angular现仅workers改1，三端统一1，阈值1500/100与零重试保持；后续最终完整351任务和三端51/51已通过。

## 最终门禁（全部通过）

最终完整affected EXIT0：86项目、351任务、324本地缓存、12m14（`/private/tmp/bom-affected-final-serial.log`）。三端共享51/51、demo24/24通过；Angular203/203（5.8m）、React199/199（5.5m）、Vue182/182有效缓存。最终首屏/输入p95分别1206/15.6、1105.2/42.2、796.3/9.5ms，均满足1500/100ms原预算，三端tree/editor均468px。

PGlite真实summary/final已从有效本地缓存恢复：13任务、12缓存、791ms，日志`/private/tmp/bom-pglite-final-coverage-restored.log`。严格8包官方coverage逐包执行8次全部EXIT0，证据`/private/tmp/bom-final-coverage-eight-packages.log`；SQLite/PGlite两条趋势软提示保留、均达门槛，baseline未改。早期仅评估rxdb一包的日志不作为8包证据。

| 端      | 首屏ms | 输入p95 ms | tree/editor px |
| ------- | -----: | ---------: | -------------: |
| Angular | 1206.0 |       15.6 |        468/468 |
| React   | 1105.2 |       42.2 |        468/468 |
| Vue     |  796.3 |        9.5 |        468/468 |

六份最终performance/layout JSON保留实际100节点、输入2轮预热/20测量样本；首屏为firstData单次耗时，输入记录p50/p95/max。350任务那轮Angular1622.6ms失败、1340ms同产物控制及原始报告均保留，最终新full通过才用于关闭。

A/R仅本地ESLint追加真实断言helper，定向两项目--max-warnings=0零警告通过（`/private/tmp/bom-e2e-lint-final-zero.log`）；三端workers=1，预算和零重试不变。API、包图、构建入口、需求及正式8包覆盖率审计通过；最新bundle静态49185/完整94194字节，三绑定4069/2769/3715字节均达标。

本轮18条任务全部关闭，spec011～024共256/256完成，19条BOM故事、US-522 AC#1与US-030均Done。失败/控制历史、正式审计与最终结果见[最终验收](../021-bom-closure/closure-map.md)。
