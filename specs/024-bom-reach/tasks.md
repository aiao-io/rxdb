# Tasks: BOM 物料级可达性

**Input**: [spec.md](spec.md)、[plan.md](plan.md)。  
**状态**: Done。Reach52、真实PG12、领域886、共享51/demo24、隔离原型/维护成本及最终351任务全部通过，R001～R022全部完成。

## Phase 1: US0 先证明真实主数据热路径

- [x] R001 [US0] 在独立 `benchmarks/bom-reach.bench.ts` 补真实主数据反查，覆盖100/1000/10000物料有界组件中的共享装配、重边、8层路径、无使用方和20菱形，不使用实例API。
- [x] R002 [US0] 主会话用Node/PGlite串行跑5次预热/20次采样，保存 `benchmarks/reports/bom-reach-baseline.json` 的原始样本、结果路径数、截断、实际SQL和查询计划。
- [x] R003 [US0] 索引对照及独立 `bom-reach-pruning-prototype.json` 已完成。2026-10-18T00:29:59Z隔离复测：非空9.376→10.327ms、空结果1.798→1.235ms、10000路径17.943→18.852ms；收益/负收益原样保留，不把简单索引收益或受污染样本归给闭包。
- [x] R004 [US0] 主会话按实测复核：236.24→7.60ms由最小子件索引解决；闭包用于存储维护/判环，读取剪枝未证实收益前不默认启用；实体、迁移和128合同已收敛。

## Phase 2: US1 数据与增量维护，先红后绿

- [x] R005 [US1] `packages/rxdb-plugin-bom/tests-reach/bom-reach-maintenance.spec.ts` 双后端先红后绿，覆盖作用域、正长度对、consume和A×D增量；最小schema后真实14例12红/2绿。
- [x] R006 [US1] 同测试覆盖重边/菱形替代路径/最后支持删除、端点/方向更新与rollback，独立递归oracle逐对比较。
- [x] R007 [US1] `src/reach/entities.ts` 已定义四业务列、双向索引、system权限和log:false，系统贡献兼容旧entities配置。
- [x] R008 [US1] `src/reach/reach-ddl.ts` / `reach-sql.ts` 实现双后端集合维护，经 `plugin.ts` 最小接线，失败随源语句原子回滚。
- [x] R009 [US1] `tests-reach/bom-reach-nontopology.spec.ts` / `bom-reach-ecn.spec.ts` 用临时DML审计证明完整非拓扑矩阵零写入；无关作用域零写入同样通过。
- [x] R010 [US1] `tests-reach/bom-reach-oracle.spec.ts` 四图形各40次固定种子增删改逐步对拍；安装事实不影响闭包。

## Phase 3: US3 存储层判环、ECN和迁移，先红后绿

- [x] R011 [US3] `tests-reach/bom-reach-maintenance.spec.ts` / `bom-reach-ecn.spec.ts` 覆盖直连、draft头/ECN、未生效ECN、取消/撤回、方向切回与非法归属拒绝后的闭包不变。
- [x] R012 [US3] `tests-reach/bom-reach-upgrade.spec.ts` / `bom-reach-scale.spec.ts` 验证旧库回填、重连、坏闭包拒绝、坏旧图水位回滚与128硬停；新增 `bom-reach-backup.spec.ts` 双后端2/2通过：真实无闭包/无水位旧库经物理备份恢复到当前插件，五张主表原行保真，connect回填3对与唯一水位，继续增删边维护后重连不重建派生行。证据：本地日志`bom-full-coverage.log`（未留存）。
- [x] R013 [US3] `src/reach/cycle-ddl.ts` 已接点查与单分支有界见证，排除OLD取得真实路径；128硬停和41节点见证22.01/6.30ms实测通过。
- [x] R014 [US3] `src/reach/system.ts` / `migration.ts` 经现有系统迁移原子回填并启用约束，重连只验证、不删除重建，缺失/错误闭包明确失败。
- [x] R015 [US3] `src/resolve/cycle-constraint-ddl.ts` 导出的远端DDL接入可达维护，拓扑新增/更新/删除复用作用域锁与Read Committed检查；真实PostgreSQL12/12通过，覆盖反向边排队、提前快照隔离拒绝、跨作用域死锁、删除/反向插入串行和调用方事务ROLLBACK撤销表/约束安装。证据：本地日志`bom-reach-pg-12-green.log`（未留存）。

## Phase 4: US2 读取兼容与预算，先红后绿

- [x] R016 [US2] `tests-reach/bom-reach-context.spec.ts`双后端新增8/8通过：逐路径核对历史日期/修订、draft头/ECN与未来ECN、备选/配置/序列/批次。Reach只作并集；备选选择与候选由resolveBom及完整消费入口负责，expandBom/whereUsed保留既有首轮多头路径与排序，不更改原合同。证据：本地日志`bom-reach-context-green.log`（未留存）。
- [x] R017 [US2] `tests-reach/bom-reach-scale.spec.ts` 证明20菱形1810对，上下查询恰好10000节点且reason=paths，128写入判定不退化；其余既有预算回归随全套门禁。
- [x] R018 [US2] 最小childItemId元数据索引已接入。公平同事务原型只对空结果有31.33%局部收益，原路径已在16ms内；非空和极限路径为负收益，因此保留原上下文裁决/BFS读取，默认不启用reach剪枝。
- [x] R019 [US2] 回归 `quantity/explosion.ts`、`quantity/cost.ts`、`resolve/integration.ts` 的未解析/截断拒绝，及三框架共享视图/原BOM演示；检查物化不削弱任何完整性守卫。

## Phase 5: 收益和需求收口

- [x] R020 测量及策略决策完成：隔离5预热/20交错样本、原始SQL/计划、10k物料seed 434895.99ms与44000闭包对；真实新增/删除/qty写p95为26.498/42.070/4.819ms，均≤100ms；100物料/120边迁移单次回填440对，建表5.257ms、migration.up19.613ms。写测仅3个新增物料、每轮闭包净变化1对，不外推大扇出；极限10000路径仍超过16ms并原样记为未达预算，不据此宣称全场景通过或启用剪枝。
- [x] R021 补 `packages/rxdb-plugin-bom/README.md` 的派生数据/维护/迁移边界与公共TSDoc，更新API baseline和必要生成物；完成strict、零警告lint、四项覆盖率、build及受影响Nx门禁。
- [x] R022 依据实际证据回写US-510阶段B AC#3～#10/#12、US-507 AC#13、US-509 AC#8/#14～#16及 `specs/024-bom-reach/quickstart.md`；没有实际执行的测量/测试保持未完成。

## Dependencies 与并行边界

顺序：R001→R002→R003→R004；R005/R006先红后R007/R008；R009/R010验证维护后再R011～R015；读取优化必须先过R016/R017的红，再做R018；最后R019～R022。

不同测试文件可并行准备；共享接线先通知主会话以避冲突。所有Nx任务和数据库服务仍由主会话集中运行，实施代理不启动这些任务。默认BOM套件已收集tests-reach，独立target仍只运行Reach套件。
