# 023 集中验收记录

本记录由真实主会话执行结果驱动。候选实现、未运行的测试和失败预算不计为完成。

| 验收                                     | 已确认结果                                                                                                                            | 主会话日志                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| JSON DSL / 生成列 / 高级索引纯编译       | 首批 38/38 绿，生成列 name 默认引用的真红已修；最新核心定向共 90/90 绿                                                                | `/private/tmp/bom-storage-core-green.log`、`/private/tmp/bom-core-coverage-gaps-green.log`                   |
| 元数据继承、聚合校验与兼容               | 12/12 绿                                                                                                                              | `/private/tmp/bom-storage-metadata-green.log`                                                                |
| 实例级快照 / 多库隔离 / 唯一约束边界     | 首批 5/5 绿；唯一 GC 依赖旁路真红已修，包含在最新 90 条定向绿中                                                                       | `/private/tmp/bom-storage-override-green2.log`、`/private/tmp/bom-core-coverage-gaps-green.log`              |
| 两端真实 DDL、目录、漂移、持久升级与回滚 | 16/16 绿                                                                                                                              | `/private/tmp/bom-storage-coproduct-green2.log`                                                              |
| 透明查询、审计迁移与全部重放             | hot 8 + helper 11 + replay 6 = 25/25 绿                                                                                               | `/private/tmp/bom-hot-final-green.log`                                                                       |
| 目录验真、失败封闭与 DDL 方言回归        | 新增 18 条，包含在核心 90/90 定向绿中                                                                                                 | `/private/tmp/bom-core-coverage-gaps-green.log`                                                              |
| strict 构建                              | 四应用与其依赖 53 个任务通过                                                                                                          | 主会话确认；不等于完整覆盖率及受影响门禁通过                                                                 |
| 核心四项覆盖率                           | 本轮affected中151文件、2660通过/1既有跳过；语句95.56%、分支92.29%、函数96.16%、行96.27%，四项均≥90%                                   | `/private/tmp/bom-affected-complete3.log`、`coverage/packages/rxdb/coverage-summary.json`                    |
| BOM完整领域与四项覆盖率                  | 60文件、886/886通过，含52 Reach、49联产、16 v2集成、6种子及55既有导入导出；语句95.05%、分支85.72%、函数96.21%、行96.56%，四项均≥80%   | `/private/tmp/bom-affected-complete3.log`、`coverage/packages/rxdb-plugin-bom/coverage-summary.json`         |
| SQLite共同层完整回归                     | 64文件、1502通过/21既有跳过；语句94.79%、分支90.09%、函数93.78%、行95.92%，四项均≥80%                                                 | `/private/tmp/bom-sqlite-core-final-green.log`、`/private/tmp/bom-affected-complete3.log`                    |
| 查询缓存兼容回归                         | 15文件、205/205通过；更新准备句柄夹具已补释放                                                                                         | `/private/tmp/bom-affected-complete3.log`                                                                    |
| WA适配器与物理备份恢复                   | 22文件、878通过/14既有跳过；备份套件72例中实际执行58例，含新增复合唯一外键及触发器恢复回归                                            | `/private/tmp/bom-affected-complete3.log`                                                                    |
| 周边插件兼容回归                         | graph 189/189、devtools 998/998、working-tree 1134/1134通过                                                                           | `/private/tmp/bom-affected-complete3.log`                                                                    |
| 其他平台兼容回归                         | PGlite1421/1421、Electron打包56通过/4既有跳过、Electron内存2/2通过；full3的PGlite默认覆盖率关闭，后续显式采集见下行                   | `/private/tmp/bom-affected-complete3.log`                                                                    |
| PGlite显式测量与最终恢复                 | 四项94.99/87.53/94.32/96.47%达标；最终full后13任务/12缓存791ms恢复真实summary/final，随后8包严格审计全部EXIT0                         | `/private/tmp/bom-pglite-final-coverage-restored.log`、`/private/tmp/bom-final-coverage-eight-packages.log`  |
| Tauri额外宿主门禁                        | clippy零警告、Rust163通过/1既有doc ignored、conformance15文件691通过/9既有跳过；Nx21任务通过、16缓存、2m35                            | `/private/tmp/bom-tauri-final-gates.log`                                                                     |
| 对称修复后三绑定                         | Angular15/15、React17/17、Vue18/18；四项99.01/100/100/98.66、89.31/87.30/95.34/92.59、100/97.36/100/100%，均≥80%，7条增强行为先红后绿 | `/private/tmp/bom-components-symmetry-green.log`                                                             |
| 搜索首个修复Node阶段（历史）             | 33文件297/297，四项91.13/80.39/94.88/92.80%，后续追加pending竞态后由下行覆盖当前结论                                                  | `/private/tmp/bom-search-refresh-green.log`                                                                  |
| 搜索pending竞态最终Node                  | auditTime80/0先2失败/10通过，再完整33文件299/299，Node四项91.13/80.46/94.88/92.80%达标                                                | `/private/tmp/bom-search-pending-red.log`、`/private/tmp/bom-search-pending-green.log`                       |
| 搜索最终browser及合并覆盖率              | 真实browser6文件52/52，Node299/299，合并四项93.50/84.80/96.80/94.70%已读有效summary，均≥80%                                           | `/private/tmp/bom-affected-final-complete.log`、`coverage/packages/rxdb-plugin-search/coverage-summary.json` |

此前独立完整轮次的历史四项为95.56/92.29/96.16/96.29%，见`/private/tmp/bom-core-full-coverage3.log`；前轮affected为95.50/92.18/96.16/96.21%，见`/private/tmp/bom-affected-complete.log`。上表采用第三轮当前最终核心产物95.56/92.29/96.16/96.27%。full3已结束：349任务、39m44、166本地缓存命中，除Vue/React两e2e首屏失败外，其余347通过或使用有效缓存。Electron1267通过/8既有跳过、Angular基础绑定266/266、完整demo24/24及历史358、加密279、客户端生成器382、树浏览器253项也已有通过证据；最终复验和独立门禁均已完成，故事已Done。

前两轮完整收集分别因querycache和SQLite版本切换的过期mock中止。补齐`prepareUpdate.release`和真实`rxdb.config`后，已分别205/205、1502通过/21既有跳过；证据为`/private/tmp/bom-querycache-final-green.log`与`/private/tmp/bom-sqlite-core-final-green.log`。第三轮移除`nxBail`以完整收集全部任务，不将前两轮记成首次全绿。

各轮首屏/OPFS/搜索历史见020。350任务Angular1622.6ms失败及1340ms单性能控制明确保留；最终完整351任务EXIT0、共享51/51、demo24/24已通过，最终三端首屏/输入p95为1206/15.6、1105.2/42.2、796.3/9.5ms，均468px等高。

[BOM 热字段报告](../../benchmarks/reports/bom-hot-fields.json) 保存实际 10000 行、50 条命中（0.5%）的两端 B-tree、PG GIN 原始 SQL / EXPLAIN、正常 GIN pending list 清理 84 页、迁移审计与 DDL 原始耗时，以及浏览器/后端/配置。规划器未禁用顺序扫描。迁移 fixture 为一条旧 Item，其他作用域为空，不能将该耗时外推到大库。

最终性能在全部声明索引均存在、目录核对通过后采集，每项 5 次预热、20 个原始样本，分位数采用 nearest rank。宿主为 Darwin arm64 / Node v26.12.0，浏览器为日志记录的 HeadlessChrome 156；本轮启用了完整 BOM 覆盖率插桩。

| 后端 / 指标           | p50 ms | p95 ms | max ms | p95 预算 ms |
| --------------------- | -----: | -----: | -----: | ----------: |
| WA / filterByAttr     |  0.695 |  0.725 |  0.735 |          16 |
| WA / saveExt          |  1.165 |  1.565 |  3.490 |         100 |
| PGlite / filterByAttr |  1.180 |  1.215 |  1.235 |          16 |
| PGlite / saveExt      |  1.420 |  2.585 |  3.885 |         100 |

这组样本及实际EXPLAIN来自`/private/tmp/bom-full-coverage.log`，其中hot 8/helper 11/replay 6均绿；当次汇总仅旧DECIMAL_FIELDS清单断言遗漏新增份额，修复后该导入导出契约套件55/55单独通过，并已纳入第三轮BOM886/886完整通过。当时full3剩余两项e2e失败进入串行复验；此后最终351任务及8包严格覆盖率全部通过，T016/T017/T018已分别据其验收证据关闭。

[优化前基线](../../benchmarks/reports/bom-hot-fields-baseline.json) 保留 WA 默认带日志的纯读事务 p95 36.28ms 的全部原始样本。生产已将纯读事务显式关闭事务日志，避免重建全 BOM 触发器，预算未变。

最终完整affected EXIT0：86项目、351任务、324本地缓存、12m14（`/private/tmp/bom-affected-final-serial.log`）。三端共享51/51、demo24/24通过；Angular203/203（5.8m）、React199/199（5.5m）、Vue182/182有效缓存。最终首屏/输入p95分别1206/15.6、1105.2/42.2、796.3/9.5ms，均满足1500/100ms原预算，三端tree/editor均468px。

PGlite真实summary/final已从有效本地缓存恢复：13任务、12缓存、791ms，日志`/private/tmp/bom-pglite-final-coverage-restored.log`。严格8包官方coverage逐包执行8次全部EXIT0，证据`/private/tmp/bom-final-coverage-eight-packages.log`；SQLite/PGlite两条趋势软提示保留、均达门槛，baseline未改。早期仅评估rxdb一包的日志不作为8包证据。

本轮18条任务全部关闭，spec011～024共256/256完成，19条BOM故事、US-522 AC#1与US-030均Done。失败/控制历史、正式审计与最终结果见[最终验收](../021-bom-closure/closure-map.md)。 T017/T018、US-030 D及US-519 #3/#7已全部关闭。
