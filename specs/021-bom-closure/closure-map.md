# BOM 最终验收结果

BOM本轮已完成：spec011～024的256条任务全部勾选，19条BOM故事全部Done，跨域前置US-030也已Done。US-522 AC#1按三端共享51/51关闭。全仓YAML实际计数为95 Done、1 In Progress、1 In Review、3 Backlog，共100条；剩余故事均不属于BOM。

## 最终完整门禁

`/private/tmp/bom-affected-final-serial.log`确认最终完整affected EXIT0：86项目、351任务、324本地缓存命中、12m14。lint、typecheck、spec-typecheck、test、test-memory、test-browser、build、audit-lazy-backend、e2e全部通过。

| 端      | 完整e2e           | BOM共享 | 100节点首屏ms | 输入p95 ms | tree/editor高度px |
| ------- | ----------------- | ------- | ------------: | ---------: | ----------------: |
| Angular | 203/203，5.8m     | 17/17   |        1206.0 |       15.6 |           468/468 |
| React   | 199/199，5.5m     | 17/17   |        1105.2 |       42.2 |           468/468 |
| Vue     | 182/182，有效缓存 | 17/17   |         796.3 |        9.5 |           468/468 |

BOM共享合计51/51，独立BOM demo24/24（新增联产及原23条）通过。三端均workers=1，首屏1500ms/输入p95 100ms预算及零重试保持。当前六份performance/layout JSON保留实际原始样本；输入2次预热、20个测量样本，100个可见节点。首屏为本次导航的firstData耗时，不冒称首屏p95。

## 覆盖率与宿主

以下为本轮有效summary的语句/分支/函数/行百分比。8包官方门禁全部EXIT0、0包低于阈值。

| 包                       |  语句 |  分支 |  函数 |    行 | 门槛 |
| ------------------------ | ----: | ----: | ----: | ----: | ---: |
| rxdb                     | 95.56 | 92.29 | 96.16 | 96.27 |   90 |
| rxdb-adapter-sqlite-core | 94.79 | 90.09 | 93.78 | 95.92 |   80 |
| rxdb-adapter-pglite      | 94.99 | 87.53 | 94.32 | 96.47 |   80 |
| rxdb-plugin-bom          | 95.05 | 85.72 | 96.21 | 96.56 |   80 |
| rxdb-plugin-bom-angular  | 99.01 |   100 |   100 | 98.66 |   80 |
| rxdb-plugin-bom-react    | 89.31 | 87.30 | 95.34 | 92.59 |   80 |
| rxdb-plugin-bom-vue      |   100 | 97.36 |   100 |   100 |   80 |
| rxdb-plugin-search       | 93.50 | 84.80 | 96.80 | 94.70 |   80 |

正式证据为`/private/tmp/bom-final-coverage-eight-packages.log`。每包分别执行一次`pnpm nx run @aiao/source:audit-coverage --args='--projects=<name> --check'`，共8次；Nx23会拆逗号args列表，早期`bom-final-coverage-audit.log`仅评估rxdb一包，不作为8包结论。

PGlite默认full会恢复无coverage产物；最后full后已用原显式Nx命令从有效本地缓存恢复真实summary/final（13任务、12缓存、791ms），证据`/private/tmp/bom-pglite-final-coverage-restored.log`。SQLite共同层和PGlite有两条历史趋势下降软提示，均达80%硬门槛，未改coverage baseline；正式审计如实保留提示。

Tauri额外门禁通过：clippy零警告；Rust163通过/1既有doc ignored；conformance15文件691通过/9既有skip，覆盖52MiB、真实disk_full、备份恢复内存曲线。Nx21任务、16缓存、2m35，见`/private/tmp/bom-tauri-final-gates.log`。核心2660/1既有skip、SQLite1502/21既有skip、BOM886、搜索Node299/browser52均有有效通过证据。

## 根审计与体积

API54公开包/86入口、构建入口47包、需求一致性均通过；包图更新后check通过（55登记包、34已发布v0.0.26、9情景），两种包数口径不混用。证据为`/private/tmp/bom-final-root-audits.log`及`/private/tmp/bom-package-graph-final-{update,check}.log`。最终状态回写后的需求与包图检查均通过，证据为`/private/tmp/bom-final-state-audits-clean.log`；格式检查通过，证据为`/private/tmp/bom-final-format-check.log`。运行代码与配置在最终351任务后保持冻结。

| 入口        | 静态gzip字节 | 完整可达gzip字节 |
| ----------- | -----------: | ---------------: |
| BOM核心     |        49185 |            94194 |
| testing     |        25053 |            25053 |
| Angular绑定 |         4069 |             4069 |
| React绑定   |         2769 |             2769 |
| Vue绑定     |         3715 |             3715 |

各入口静态依赖均低于50000字节，动态可达照实另报，外部peer单列。主基准100节点查询/保存/刷新p95为13.158/1.012/34.660ms，通过16/100/100ms原预算。

## 本轮关闭的18条任务

| 切片 | 关闭任务         | 最终证据                                                  |
| ---- | ---------------- | --------------------------------------------------------- |
| 011  | T028             | 存储家族、Tauri额外门禁、完整affected及8包覆盖率          |
| 020  | T028             | 三端最终性能/布局六JSON、主基准、最终bundle               |
| 020  | T030             | 三端共享51、demo24、组件15/17/18、完整affected及覆盖率    |
| 020  | T031             | API/包图/需求/构建入口/8包覆盖率审计及文档回写            |
| 020  | T032             | 最终351任务EXIT0，全部失败/控制/修复历史保留              |
| 020  | T033             | US-522 #1、US-520 #11、US-524 #7及对应故事关闭            |
| 021  | P006             | 真实PG12、strict/lint和最终完整门禁                       |
| 021  | R001             | spec024 Reach52、隔离原型、维护/迁移成本及完整联合验收    |
| 021  | R002             | spec022联产49、v2集成16、种子6、demo24及最终门禁          |
| 021  | R003             | spec023双端DDL/目录16、查询/迁移/重放25、真实命中计划     |
| 021  | R004             | 独立功能证据、故事状态与真实YAML汇总同步                  |
| 022  | J016、J017       | 联产文档/API、完整领域、三端/demo及最终门禁               |
| 023  | T017、T018       | core≥90%、其他相关包≥80%、US-030 D和US-519 #3/#7          |
| 024  | R019、R021、R022 | 完整性/旧行为、三端51/demo24、文档/API、Reach相关故事关闭 |

021 R001～R003是已拆到专项切片的实施总任务，现随专项验收核销；不再重复计为功能缺口。012～019原已全部完成，256条总任务无未勾选项。

## 故事结果

本轮由进行中关闭的10条BOM故事：US-507、508、509、510、511、513、519、520、522、524。原Done的9条保持Done：US-512、514、515、516、517、518、521、523、525。Epic009共19条全部Done；US-030从In Review关闭为Done，仍归epic004，不计入BOM19条。

全仓其余未关闭故事保持原状：US-211 In Progress、US-219 In Review，US-029/910/911 Backlog。未扩大独立故事范围。

## 失败、控制与报告边界

- 两轮完整验收分别因querycache/SQLite过期mock中止，修复后205/1502定向复验通过；不写成首次全绿。
- full3为349任务、166缓存、39m44，Vue/React默认8 workers仅首屏失败；同产物单worker控制后改为1，保留两份8-workers原始报告。后续OPFS同步定向2绿，搜索clear及pending两批真实红绿保留；pending第二批先2失败/10通过，再完整Node299绿，最终browser52合并达标。
- `bom-affected-final.log`是主动中断exit130，非测试失败、不计完成。`bom-affected-final-complete.log`是350任务、291缓存、17m13，唯一Angular202/203首屏1622.6ms失败，输入p95=16.1ms正常；该轮完整共享50/51。旧full3 Angular203/1088.7ms不作为这轮通过证据。
- Angular同一未改产物workers1单性能控制1/1通过，firstData1340ms、输入p95=14.7/max15.1ms；两份`bom-view-angular-performance-{2-workers,1-worker-control}.json`均保留。随后仅Angular workers2→1，三端统一1，最终新完整full和51/51才据此关闭。
- A/R两条expect-expect旧误报只追加真实含expect的`expectFitsHorizontally`本地登记，未改运行/测试行为；两项目`--max-warnings=0`零警告通过，证据`/private/tmp/bom-e2e-lint-final-zero.log`。不以旧86项目lint记录替代最终证据。
- Reach读取默认不启用闭包剪枝；10k改善236.24→7.60ms归最小childItemId索引。隔离原型非空9.376→10.327ms、空1.798→1.235ms、10000路径17.943→18.852ms如实保留；440对小图迁移19.613ms不能外推大库，大扇出写入不由代表性单边样本外推。

## 证据入口

[011宿主/存储](../011-bom-slice-1/quickstart.md)、[020三端/性能/历史](../020-bom-slice-10/quickstart.md)、[020研究记录](../020-bom-slice-10/research.md)、[公共合同](../020-bom-slice-10/contracts/bom-view-api.md)、[021真实PG](quickstart.md)、[022联产](../022-bom-coproduct/quickstart.md)、[023热字段/覆盖率](../023-bom-hot-fields/validation.md)、[024 Reach](../024-bom-reach/quickstart.md)。

故事正文中的阶段记录集中保存于[验收留档](story-validation-history.md)，需求正文保留契约、引用与当前结论。
