# BOM Reach 验证记录

## 已执行的主数据基线

主会话运行 `pnpm nx run benchmarks:benchmark-bom-reach`，2026-10-18 07:03（Asia/Shanghai）生成原始报告。环境：Node26.12.0、macOS arm64、Apple M1 Max、32GiB内存；PGlite独立内存库，预热5次、采样20次。装载和验证不计入API采样，实际SQL/参数与EXPLAIN保留在报告。

- [原始基线](../../benchmarks/reports/bom-reach-baseline.json)
- [索引对照](../../benchmarks/reports/bom-reach-comparison.json)

| 工作负载              | 原索引p95 | 仅childItemId索引p95 | 结论                                 |
| --------------------- | --------: | -------------------: | ------------------------------------ |
| 100物料，有使用方     |   14.24ms |               7.85ms | 原路径已在16ms内                     |
| 1000物料，有使用方    |   11.53ms |              11.80ms | 小幅负收益，照实保留                 |
| 10000物料，有使用方   |  236.24ms |               7.60ms | 改善96.78%，最小索引解决真实热路径   |
| 10000物料，无使用方   |    3.69ms |               2.50ms | 原路径已经在预算内                   |
| 20菱形，返回10000路径 |  259.06ms |             370.74ms | 路径输出工作量，不能宣称闭包自然加速 |

20菱形再加作用域索引为325.40ms，相对原索引仍回退25.61%。因此生产仅接`occurrence_child_item`元数据索引；不增加作用域索引，不默认启用reach读取剪枝。

## 已执行的隔离原型与成本

主会话独占Nx/构建CPU运行 `pnpm nx run benchmarks:benchmark-bom-reach-prototype`，报告生成于2026-10-18T00:29:59.541Z，耗时7分52秒。原始样本、实际SQL/EXPLAIN、索引、CLI参数和环境完整保存在[隔离报告](../../benchmarks/reports/bom-reach-pruning-prototype.json)。首次顺序采样受种子GC/并行构建污染，另存[无效归因样本](../../benchmarks/reports/bom-reach-pruning-prototype-unisolated.json)，不将193.99→7.37ms当作非空剪枝收益。

修订target显式使用`--expose-gc`，种子完成后及每个样本前GC；两个phase共享同一个TransactionExecutor入口，5次同等预热后20轮交错并反序。GC、验证与EXPLAIN不计入查询计时。此处是公平的原型内核对照，不能与上节旧facade/索引基线直接拼成跨轮收益。

| 场景                          | indexed p95 ms | reach-prune p95 ms |    收益 | 决策                               |
| ----------------------------- | -------------: | -----------------: | ------: | ---------------------------------- |
| 10000物料，有使用方，12条路径 |          9.376 |             10.327 | -10.14% | 非空只多点查，不声明加速           |
| 10000物料，无使用方           |          1.798 |              1.235 |  31.33% | 原路径已满足16ms，无必要默认开启   |
| 20菱形，返回10000路径并截断   |         17.943 |             18.852 |  -5.07% | 路径预算场景，恰好10000条并标paths |

默认仍不剪枝。依照SC-004，普通主数据热查询按16ms验收；10000路径预算场景只记录完整耗时和截断，不套用普通查询阈值。极限路径枚举不因闭包自动消失。

10k物料/12000发生项装载434895.986ms，闭包44000对；20菱形61物料/80边装载344.128ms，闭包1810对。seed不混入热查询或保存样本，维护成本另列：

| 背景 / 真实Repository操作 | p50 ms | p95 ms | max ms | p95预算 ms |
| ------------------------- | -----: | -----: | -----: | ---------: |
| 10k / 新增consume         | 25.263 | 26.498 | 28.425 |        100 |
| 10k / 删除consume         | 40.908 | 42.070 | 43.414 |        100 |
| 10k / 非拓扑qty保存       |  4.620 |  4.819 |  5.377 |        100 |
| 20菱形 / 新增consume      |  3.591 |  3.789 |  4.115 |        100 |
| 20菱形 / 删除consume      |  3.183 |  3.652 |  4.912 |        100 |
| 20菱形 / 非拓扑qty保存    |  2.364 |  2.634 |  2.654 |        100 |

每项5预热/20原始样本，通过真实Repository或实体save写入，不用raw写绕过校验。写fixture在同组织背景图增加3个物料和独立草稿组件，保留一条qty发生项，每轮新增/删除令闭包净变化1对（10k背景每轮44001→44002→44001）。这是代表性单边维护成本，不外推大扇出A×D写入。

迁移fixture为100物料/120发生项的业务表，保留当前业务索引，装载时没有Reach系统贡献或派生表。真实system migration.up单次回填440对：seed333.038ms、建表5.257ms、迁移事务19.613ms。迁移事务含回填/完整性验证/维护DDL，不含完整连接引导与水位认领；单次小图不可外推大库。普通索引对照脚本仅在独立内存库移除已交付childItemId索引再测existing，避免重复索引伪对照。

## 已执行的真实红绿

全部任务由主会话集中运行，实施代理没有自行启动Nx或数据库服务。

| 阶段                        | 实际结果                                                                                                                                 | 证据                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 最小schema后的维护红        | 14例中12失败/2通过；表存在但闭包为空，与独立oracle不符                                                                                   | `/private/tmp/bom-reach-red-isolated.log`                                                 |
| 初版维护绿                  | 双后端14/14通过                                                                                                                          | `/private/tmp/bom-reach-maintenance-green.log`                                            |
| 升级/方向回归               | 真实旧库无回填、方向切回consume漏检被复现；WA测试另修49字节库名问题，该基础设施失败不作为功能红                                          | `/private/tmp/bom-reach-upgrade-red.log`                                                  |
| 迁移/判环/规模绿            | 双后端24/24通过                                                                                                                          | `/private/tmp/bom-reach-scale-green.log`                                                  |
| 真实PostgreSQL回归          | 8/8通过，含反向边排队、RR/Serializable拒绝、跨作用域死锁                                                                                 | `/private/tmp/bom-reach-pg-green.log`                                                     |
| 完整Reach矩阵               | 双后端42/42通过；含非拓扑零DML、固定种子随机oracle、ECN和坏闭包/水位回滚                                                                 | `/private/tmp/bom-reach-final-green.log`                                                  |
| 拓扑UPDATE/DELETE远端回归   | 真实PostgreSQL11/11通过，新增隔离拒绝和删除/反向插入锁串行                                                                               | `/private/tmp/bom-reach-pg-final-green.log`                                               |
| 真实旧物理备份恢复红        | WA恢复修订行失败：独立唯一索引晚于灌行，外键目标索引尚未建立；PG已恢复并完成拓扑操作，仅末尾重连误用旧adapter，该测试错误不作为功能红    | `/private/tmp/bom-reach-backup-green.log`（该文件名不代表当次已通过）                     |
| 真实旧物理备份恢复绿        | 双后端2/2通过，共14.112s；WA0.915s、PGlite13.197s                                                                                        | `/private/tmp/bom-full-coverage.log`                                                      |
| 含旧备份的Reach矩阵（历史） | 默认BOM套件当次收集的44/44条Reach通过；当次全套另有旧`DECIMAL_FIELDS`清单断言遗漏新增`jointCostShare`，修复后已合并入下方当前886/886结果 | `/private/tmp/bom-full-coverage.log`                                                      |
| 远端事务边界最终回归        | 真实PostgreSQL12/12通过，新增导出DDL保留调用方事务、ROLLBACK撤销派生表与约束安装                                                         | `/private/tmp/bom-reach-pg-12-green.log`                                                  |
| SQLite共同层完整回归        | 64文件、1502通过/21既有跳过；语句/分支/函数/行覆盖率94.79/90.09/93.78/95.92%，四项均≥80%                                                 | `/private/tmp/bom-sqlite-core-final-green.log`、`/private/tmp/bom-affected-complete3.log` |
| WA通用备份恢复兼容          | 22文件、878通过/14既有跳过；备份套件72例中58例实际执行，含新增复合唯一外键及触发器恢复回归                                               | `/private/tmp/bom-affected-complete3.log`                                                 |
| 当前BOM完整领域回归         | 60文件、886/886通过，含52条Reach、49条联产、16条v2集成、6条联产种子及55条旧import；语句/分支/函数/行95.05/85.72/96.21/96.56%，四项均≥80% | `/private/tmp/bom-affected-complete3.log`                                                 |

规模验收已实测：20串菱形61物料/80边物化1810对，上下查询恰好10000路径并标`paths`。真实成环点查与41节点单见证耗时：WA22.01ms、PGlite6.30ms；130节点链的新父插入仍在128判定硬停时拒绝，原可达表不变。

旧物理备份回归的源库明确不存在`bom_reach`表及`0001-bom-reach`水位，使用真实backup/restore入口恢复到当前插件配置。恢复后的五张主表全部原行相同，connect回填三对可达关系且只写一次迁移水位；新增C→D后六对、删除后回到三对，重连保留闭包原行。WA恢复的真实缺陷通过“建表→建索引→灌行→建视图/触发器”修复，仍在同一恢复事务内。新增通用复合唯一外键/触发器回归已随WA备份套件实际执行通过：独立唯一索引先于灌行建立，恢复不重放业务触发器，`foreign_key_check`为空；其余14例为该套件既有跳过。SQLite共同层64文件完整回归也已通过，最终受影响门禁仍在集中收集。

## 复现入口

```bash
pnpm nx run rxdb-plugin-bom:test-reach
pnpm nx run rxdb-plugin-bom:test-pg
pnpm nx run benchmarks:typecheck
pnpm nx run benchmarks:benchmark-bom-reach-prototype
```

完整Reach矩阵当前52例已随默认BOM完整套件886/886通过：原44条维护/备份回归覆盖非拓扑零DML矩阵、四种图形每种40次固定种子增删改oracle、ECN取消/撤回、损坏闭包拒绝、坏旧图迁移水位回滚及旧物理备份恢复，新增8条上下文兼容回归见下节。默认BOM测试配置已纳入`tests-reach`，覆盖率和全门禁不会遗漏这些回归。

真实PG12例已全部通过，包括“导出DDL批次保留调用方事务，ROLLBACK撤销表/约束安装”；导出不包含自行提交调用方事务的BEGIN/COMMIT。读取剪枝原型与R020写入/迁移/维护成本及策略决策已按上述隔离报告完成；最终统一门禁已通过。

当前完整领域回归与BOM四项覆盖率已通过，完整BOM demo24/24（50.9s）包含新联产与原23条也已通过；PGlite显式覆盖率及Tauri额外门禁也已通过，搜索/三端对称性修复复验、五项审计及最终351任务均已通过，当前结论见下方最终记录。

## 2026-10-18 上下文兼容追加验证

主会话已确认`tests-reach/bom-reach-context.spec.ts`新增双后端 **8/8通过**，证据为`/private/tmp/bom-reach-context-green.log`。覆盖历史D/E与precise锁版、draft头/未发布与未来ECN，以及备选/配置/序列/批次的逐路径上下查询；闭包命中不能使上下文不可用的行进入完整消费。

Reach只作并集；备选选择与候选由resolveBom和完整消费入口负责，expandBom/whereUsed沿既有首轮多头路径合同，测试精确保留该基线。首跑中误把备选裁决套在expandBom上的断言已修正，未为测试改变原API行为。quantity仍保留既有未解析/截断标记，成本与导出明确拒绝完整性不足；R019的完整领域、24条demo、最终三端51条与351任务联合验收均已通过。

旧维护/备份44条与新上下文8条合计52条，现已随60文件、886/886的完整默认BOM套件通过；真实PG12条另有独立通过证据。原型隔离复测及R020写入/迁移/维护成本已完成，R019/R021/R022已随最终三端51/51与统一门禁全部关闭，受GC或并行污染的旧原型数字不作结论。

最终完整affected EXIT0：86项目、351任务、324本地缓存、12m14（`/private/tmp/bom-affected-final-serial.log`）。三端共享51/51、demo24/24通过；Angular203/203（5.8m）、React199/199（5.5m）、Vue182/182有效缓存。最终首屏/输入p95分别1206/15.6、1105.2/42.2、796.3/9.5ms，均满足1500/100ms原预算，三端tree/editor均468px。

PGlite真实summary/final已从有效本地缓存恢复：13任务、12缓存、791ms，日志`/private/tmp/bom-pglite-final-coverage-restored.log`。严格8包官方coverage逐包执行8次全部EXIT0，证据`/private/tmp/bom-final-coverage-eight-packages.log`；SQLite/PGlite两条趋势软提示保留、均达门槛，baseline未改。早期仅评估rxdb一包的日志不作为8包证据。

本轮18条任务全部关闭，spec011～024共256/256完成，19条BOM故事、US-522 AC#1与US-030均Done。失败/控制历史、正式审计与最终结果见[最终验收](../021-bom-closure/closure-map.md)。 R001～R022全部完成，隔离原型及迁移/大扇出成本边界保留。
