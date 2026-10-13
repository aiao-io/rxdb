# Tasks: epic-009 首轮切片第 1 步

## Phase 0: 基础设施

- [x] T001 在 specs/011-bom-slice-1/ 完成 spec/plan/tasks（本文件）
- [x] T002 [US-030 AC#7 前置] Tauri rusqlite 0.32 → 0.33：Cargo.toml + 两份 Cargo.lock + cargo-check/clippy/test 全绿；文档回写（US-030 版本矩阵、US-217 L340、epic-009 L191、website backup.md、engine.rs 注释）

## Phase 1: US1 CHECK 与漂移（US-030 阶段 A）

独立验收：双后端拒绝越界写入且错误类一致（AC#1/#2/#8）；白名单外规则元数据期拒绝（AC#9）；init 漂移抛错点名缺失/多余（AC#10/#11/#16）；继承同名覆盖（AC#17）；字面量超值域 / 非法名元数据期拒绝（AC#15）；低版本宿主 init 失败（AC#7）。

- [x] T003 [US1] 在 `packages/rxdb/src/entity/` 定义 `CheckRule` / `CheckRuleGroup` / `EntityCheckMetadataOptions`，`EntityMetadataOptions.checks` + 属性级 `check`；`transitionMetadata` 合并（`checkMap`）；`metadata.interface.ts` 补类型；先写 metadata-transition / metadata-validate 红测试（AC#17 / 白名单 / 命名 / 值域规则）
- [x] T004 [US1] `sql-literal.ts` 补非整数字面量；新建 `entity/check-sql.ts` 编译路径（含 `ref`、`in/between`、IS NULL、8 位哈希约束命名）；`check-sql.spec.ts` + `sql-literal.spec.ts` 红→绿
- [x] T005 [US1] sqlite-core + pglite 建表 DDL 生成 CHECK（`CONSTRAINT "ck_…" CHECK (…)`）；DDL 文本测试红→绿
- [x] T006 [US1] sqlite-core 共享层 SQLite ≥ 3.47.0 版本门槛（每实例一次、点名实际版本与门槛）；mock 单测红→绿
- [x] T007 [US1] `RxDBError.ts` 新增 `RxDBCheckViolationError` + `RxDBConstraintDriftError` + 判别函数（23514 / CHECK constraint failed）；保存路径归一接入；双后端可执行测试（AC#1/#2/#8）红→绿
- [x] T008 [US1] 新适配器方法 `checkEntityConstraintDrift?` + RxDB.ts 调用点（AC#6 未实现即拒）+ PGlite（pg_constraint/pg_indexes）与 SQLite（sqlite_master）实现；双后端漂移测试（AC#10/#11/#16）红→绿
- [x] T009 [US1] `pnpm audit:api-surface:update` 同步基线、补 TSDoc、lint/typecheck/test、覆盖率 ≥ 90%（核心包）

## Phase 2: US2 条件唯一（US-030 阶段 B）

独立验收：不满足条件的重复行不被误拒、满足条件的重复行被拒（AC#3）；uq_ 进漂移；reconcile 跳过。

- [x] T010 [US2] `EntityIndexMetadataOptions.where` + 校验（`where` ⇒ `unique`、白名单与字面量同 CHECK）；`uq_` 命名；metadata-transition 继承（indexes 已按 name 合并）；红测试
- [x] T011 [US2] 双后端 partial unique index DDL（SQLite `CREATE UNIQUE INDEX … WHERE`；PG 同 + `reconcileEntityIndexes` 跳过 `uq_`）；DDL 测试红→绿
- [x] T012 [US2] 漂移比对纳入 `uq_`；双后端可执行测试（AC#3、漂移、reconcile 跳过）红→绿
- [x] T013 [US2] 门禁（lint/typecheck/test/覆盖率、api-baseline 无新增导出则不动）

## Phase 3: US3 区间排他（US-030 阶段 C）

独立验收：重叠区间双后端拒绝且报冲突区间（AC#4）；UPDATE 扩区间拒 / 自身扩区间放行（AC#12）；两维同交才冲突、相邻放行、NULL 无界（AC#13）；截止+新开重放通过（AC#14）。

- [x] T014 [US3] `EntityExclusionMetadataOptions` + `exclusions` + 校验（equal ≥1、ranges ≥1、时间/整数列、bounds）+ `ex_` 命名 + 继承合并；红测试
- [x] T015 [US3] PGlite：`btree_gist` 注入 + `CREATE EXTENSION IF NOT EXISTS` + `EXCLUDE USING gist` DDL + 23P01 → `RxDBExclusionViolationError` 归一；DDL 与执行测试红→绿
- [x] T016 [US3] SQLite：`build-exclusion-triggers.ts` 纯函数（`_i`/`_u` 双触发器、`rxdb:exclusion_violation:` 前缀、UPDATE 排除自身）+ 漂移纳入 `ex_`；DDL 与执行测试红→绿
- [x] T017 [US3] 双后端可执行测试 AC#4/#12/#13 红→绿
- [x] T018 [US3] 两侧 `execute_switch_actions` 顺序改 deletes → updates → inserts（`dispatch_switch_events` 同步；核对更新对新插行外键依赖）；AC#14 重放用例 + 全量既有共享套件回归
- [x] T019 [US3] 门禁 + api-baseline + 覆盖率

## Phase 4: US4/US5 BOM 插件（US-507 A/B + US-511 存储段）

独立验收：三行同子件并存（AC#1）；phantom 随修订 / serialized 随物料（AC#6/#7）；相邻发生项接受、重叠拒绝（AC#8/#9）；修订不属于子件拒绝（AC#11）；结构列与已发布数据直连改写全拒（AC#13/#14）；已发布头成员写入全拒（AC#10 发生项部分）；qty 规范串存取（US-511 AC#22 ①存储段/②、AC#23）。

- [x] T020 [US4] 新建 `packages/rxdb-plugin-bom` 包骨架（package.json/project.json/tsconfig×3/vite.config.mts/eslint/README/LICENSE）+ `tsconfig.base.json` paths + `requirements/package-graph.json` 登记；空包 lint/typecheck/test/build 过
- [x] T021 [US4] `item` / `item_revision` 实体 + `@BomEntity` 装饰器 + 结构列/已发布修订不可改触发器（AC#14）；双后端测试 AC#6/#7/#14 红→绿
- [x] T022 [US4] `bom_header` / `bom_line` / `bom_line_occurrence` 实体 + 排他声明（US-030 C）+ 组合外键（AC#11）+ 结构列触发器（AC#13）；双后端测试 AC#1/#8/#9/#11/#13 红→绿
- [x] T023 [US4] 已发布头成员写协议触发器（AC#10）+ `BomWriteProtocolError` / `BomPublishValidationError` 错误家族 + 发布转移校验（`effective_from` 非空、`released→draft` 拒）；双后端测试红→绿
- [x] T024 [US5] 十进制：`normalizeDecimalString` 入口规范化（指数/前导零/尾随零/`-0`，35 位/非有限/负值拒绝）+ `BomDecimalFormatError` + 双后端格式触发器（PG regex / SQLite GLOB 逐字节谓词）；测试 AC#22 ①存储与回读/②、AC#23 红→绿
- [x] T025 [US4] DDL 下发接线（inject adapter:local + bootstrapTransaction + 后端注册表 + 迁移记录签名幂等）+ 双后端全量回归
- [x] T026 [US4] 门禁：`pnpm audit:api-surface:update`（新包基线）、lint/typecheck/test、插件包覆盖率 ≥ 80%

## Phase 5: 回写与验证

- [x] T027 回写：US-030（阶段 A/B/C ⬜→✅、AC 勾选、价值待证注释）、US-507（阶段 A/B ⬜→✅、AC 勾选、AC#2/#3/#5/#12 保持 ⬜）、US-511（AC#22 存储段/AC#23 ⚠️ 注明展开段归第 3 步）、status-overview / roadmap 批次 4 / epic-009 第 1 步关闭记录、README
- [ ] T028 [US030] `pnpm audit:api-surface` + affected-ci full（lint/typecheck/test/test-memory/test-browser/build/audit-lazy-backend + tauri cargo/conformance + pglite + sqlite 家族）+ 覆盖率门禁；specs/011-bom-slice-1/quickstart.md 记录结果
- [ ] T029 提交（分阶段 WIP commit 或按 phase 提交，收尾 squash 策略按仓库惯例）

## Dependencies and implementation strategy

T001 → T002 可并行 T003 起手；US1（T003–T009）→ US2（T010–T013）→ US3（T014–T019）顺序依赖；US4 依赖 US3（排他）与 US1（CHECK 不用于 BOM，但版本门槛是触发器动态消息前置）；US5 仅依赖包骨架 T020。每任务 TDD：先红测试后实现。T002（Tauri）独立可先行。T028 的 affected 校验串行执行（本机 32GB 内存，不提高并行度）。
