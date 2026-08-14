# 完成记录

本文件记录用户故事的状态变更与 spec 关闭快照。**它不是真相源**——当前状态以 [stories/\*.md](stories/) 的 YAML `status` 字段为准；本文件只是按时间线归档"什么时候完成了什么"。

新条目追加到最上方。

## Story 状态变更

### 2026-08-15 — US-209 小程序适配器门禁与文档收尾（In Review → Done）

- `@aiao/rxdb-adapter-miniprogram` 登记进 `scripts/audit/coverage-baseline.json`（99/97/100/100，向下取整）。
  这是**趋势基准**而非门禁开关：`coverage-check.mjs` 的 80%/90% 硬阈值对所有非 private 包一直生效，
  本包此前已被卡着；登记后才有「比上次低」的回归警告。原 story 里「不受门禁保护」的措辞已修正。
- AC#8 子路径决策落定为「**导出表面**记录为已知不覆盖」：`api-surface.mjs` 新增 `KNOWN_UNCOVERED_SUBPATHS`
  （8 个公开包共 12 个入口）作为清单真相源，`subpath-inventory.mjs` 把**清单本身**纳入门禁——
  新增/删除子路径不同步清单即 CI 红。扫描子路径导出表面仍是未认领缺口。
- 策略文档双向对齐：`requirements/versioning-policy.md` 与对外的 `website/docs/versioning.md`
  同时写明子路径属于公开 API 但表面不受基线保护，消除「基线守护全部公开 API」的错误承诺。
- 文档口径收敛到「实验性、仅微信」：`website/docs/compatibility.md` 新增能力边界专节
  （平台/并发/日志模式/崩溃恢复/数据量/随机源/全文搜索），原「浏览器能力 × 适配器」表扩为「运行时能力 × 适配器」；
  根 `README.md` 不再声称支持 Alipay。
- `examples/README.md` 声明示例目录不在 CI 覆盖范围（独立 pnpm workspace、无 `project.json`、依赖已发布版本），
  改动后须手工验证。
- `packages/rxdb-adapter-miniprogram/src/index.ts` 删除逐字重复的 `@packageDocumentation` 块。

### 2026-08-01 — US-303 / US-304 迁移隔离拆分

- US-303 的 change codec、原子系统迁移、回滚重试、历史/branch/跨 Tab 兼容均已验收，状态转为 Done。
- 原 US-303 AC13 转移到新的 US-304；接收 story 以 `inherited_acs` 机器可读地记录来源。
- US-304 负责先发布旧格式兼容的 writer lease/guard 桥接协议，再实现 drain barrier、fencing、stale writer 拒绝和跨 realm/进程迁移 gate。
- Epic 005 继续 In Progress，发布门禁新增 US-304；不再把无法由当前版本单独满足的协议前置条件伪装为 US-303 未完成代码。

### 2026-07-31 — 事务执行器 C2 落地 + bigint/binary origin 隔离

**事务执行器重构（C2）**

- 新增 `SqliteTransactionExecutor`（`packages/rxdb-adapter-sqlite-core`）与 `PGliteTransactionExecutor`（`packages/rxdb-adapter-pglite`），作为对应适配器的 `TransactionExecutor` 实现
- 适配器 `transaction()` 回调签名由 `(client)` 收紧为 `(executor: TransactionExecutor)`；零参回调仍然兼容，TypeScript 自动允许形参更少
- `MigrationType.up()` 签名由 `()` 改为 `(executor: TransactionExecutor)` —— `up()` 是唯一能在事务体内运行的用户代码，必须把 executor 交给用户，否则用户在 `up()` 里的写会落回队列并永久挂起
- `mergeChanges()` 加在 **executor** 上而非 `adapter.mergeChanges()` 加 executor 形参：「持有 executor 才算在本事务内」必须只有一处判据；同步链路里 4 个事务体的主力写正是它
- `runInTransaction()` 复用当前事务的 executor（新增 `#current_executor`，**仅**服务这一个遗留入口）；C2 翻转时与 `#transaction_lock` 一并删除
- 隔离契约套件：增加 `transaction-executor.spec.ts`，sqlite-wasm 5/5 与 PGlite 5/5，包含「逃逸的 executor 在 committed / rolled-back 两条路径上都抛错」
- 设计文档同步更新：`code-reviews/transaction-executor-design.md` §6.2 / §6.2.1 / §6.2.2 / §6.3
- 公开 API 基线变化：`@aiao/rxdb` 暴露的 `TransactionFun` 回调参数类型由 `SqliteClientLike` 升级为 `TransactionExecutor`，新导出 `mergeChanges()` / `executor.run()` 等事务作用域 API

**bigint/binary origin 深度克隆**

- `transaction_pglite_result.ts` 与 `transaction_sqlite_result.ts` 在 `forcedUpdate` 时改用 `structuredClone(entityData)` 写入 `status.origin`，避免实体引用与 origin 共享同一 `Uint8Array` / 复杂对象
- 替代原有 `{ ...entityData }` 浅克隆 —— 浅克隆对 `Uint8Array` 等引用类型只复制引用不复制字节，原地修改 entity 字段会污染 origin 快照
- 公开行为对调用方不变：`status.origin` 仍是变更前的快照；新增保护是 silent data corruption 的修正式修复

**实体 Proxy 对 binary 重赋值的 patch 追踪**

- `proxy.ts` set 陷阱新增 `isBinaryReassignment` 分支：`binary` 字段原地修改不触发 patch，新引用赋值（即使字节相同）必须登记为变更
- 配套 2 条 vitest 用例（`proxy.spec.ts`）覆盖「就地修改 → 不登记」「新引用赋值 → 登记」
- `shared-bigint-binary-entity.suite.ts` 增 1 条用例验证 save 流程；`bigint-binary.suite.ts` 增 2 条用例覆盖 encrypted binary（in-place 静默 / 新引用生效 / undo 回到原始字节）
- 同步覆盖到 PGlite 测试与 system schema migration 测试（`migration-watermark.spec.ts` 已加 executor 适配）

**EntityStatus typed-id 指纹防碰撞**

- 新增 vitest 用例（`entity-status.spec.ts`）断言 `1`、`1n`、`'1'` 三种 typed id 生成的 query fingerprint 互不相同
- 为 `US-303 change codec` 中「query fingerprint / history scope key / change action key 必须区分 bigint、number 与 string」AC 提供先行护栏

**system schema 迁移套件加固**

- `shared-system-schema-migration.suite.ts` 旧 UUID 升级用例新增 Todo 实体行重建 + `versionManager.createBranch` + `history.undo`，验证迁移后业务实体可正常纳入版本历史与撤销
- PGlite 同构测试（`system-schema-migration.spec.ts`）：新增真实磁盘库重连升级用例 `RxDB.connect 自动升级磁盘旧库，旧 change 可切换分支并撤销`，覆盖更接近生产环境的迁移路径

**影响范围**

- `@aiao/rxdb`：事务回调签名；`MigrationType.up` 签名；`TransactionExecutor` 接口新增 `mergeChanges`
- `@aiao/rxdb-adapter-sqlite-core`：新增 `SqliteTransactionExecutor`，内部 helper 形参放宽到 `SqlStatementSink`
- `@aiao/rxdb-adapter-pglite`：新增 `PGliteTransactionExecutor`
- 所有调用 `rxdb.transaction(...)` 的既有代码（无参形式）仍可编译运行 —— TS 允许回调形参更少
- 自定义 migration 必须能接 `(executor)` 形参，否则迁移中的数据写入将永远挂在队列上

### 2026-05-15 — query-builder 系列清理

- 删除 US-401 查询构建器 UI、US-701 查询构建器
- 后续若以新的形态重做，将开新编号 story（不复用 US-401 / US-701）

**保留作为参考**：

- `IQueryBuilder` / `IRule` / `ICombinator` 等 where 条件类型仍保留在 `@aiao/rxdb` 入口，所有 Repository 的 `find/findAll/observe` 仍以该类型为参数 — 未来 UI 实现可直接复用
- 原 spec 文件可从 git 历史取回（删除于 commit `35f0ccdf`，路径 `requirements/stories/ui/US-401-query-builder-ui.md`、`requirements/stories/future/US-701-advanced-query-builder.md`）

**前置条件（重启 story 前满足）**：

1. 三框架 (`rxdb-{angular,react,vue}`) 完成 P0 稳定性（拖拽、虚拟滚动、批量操作的 e2e 回归零失败）
2. 决定 UI 形态：Visual Query Builder 还是 SQL-like DSL；若选前者，需先评估 `react-querybuilder` 等三方件的 Vue/Angular 端可移植性
3. 与 `rxdb-plugin-search` 的关系定义清楚（全文 vs. 结构化查询的 UX 边界）

## 依赖锁定记录

### `@codemirror/view` 钉死 `6.42.1`

`packages/code-editor-{angular,react,vue}/package.json` 与根 `package.json` `dependencies` 已显式锁定 `@codemirror/view: 6.42.1`（无脱字符），并在根 `overrides`（npm 兼容）与 `pnpm.overrides`（pnpm 优先读）双写以阻止任何间接依赖把它 hoist 回 `^6.43.0`。

**状态**：TECH DEBT。原始锁定 commit 未保留根因记录。

**解锁前 checklist**（任一未满足都保留 pin）：

1. 升级到 `@codemirror/view@latest` 并跑 `pnpm nx affected -t test build e2e --base=origin/main`
2. 跑 `pnpm nx run dev-rxdb-angular:serve`、`dev-rxdb-react:serve`、`dev-rxdb-vue:serve` 各打开 code-editor 演示页，验证编辑/合并视图无 console 错误
3. 跑 `pnpm nx test code-editor-angular code-editor-react code-editor-vue --coverage`
4. 检查 `@codemirror/state` 当前 minor (`^6.5.4`) 与目标 `@codemirror/view` minor 的 changelog，确认无 ABI 破坏

若 1-4 全过，移除根 `package.json` 的 `dependencies`/`overrides`/`pnpm.overrides` 三处 pin，并在本节追加 `解锁日期 + commit hash`。

## Spec 关闭快照

_当前仓库无遗留的 spec 关闭快照。_
