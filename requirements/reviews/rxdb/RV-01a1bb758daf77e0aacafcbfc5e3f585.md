---
id: RV-01a1bb758daf77e0aacafcbfc5e3f585
title: '核心 README 的创建示例传普通对象，公开仓库立即拒绝'
project: rxdb
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb'
status: Resolved
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-10
anchors:
  - 'packages/rxdb/README.md'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bb758daf77e0aacafcbfc5e3f585：核心 README 的创建示例传普通对象，公开仓库立即拒绝

## 问题与影响

用户按核心包快速开始定义并注册 Todo、接上一个有效适配器后，照抄 repository.create({title:write docs,done:false}) 会在第一次写入之前抛“未用 @Entity 装饰”的元数据错误。创建 API 要的是已挂载实体实例，普通对象不具备实体元数据与状态。事务速查也多次传同类普通对象，会误导使用者；属于文档中的可执行 API 示例错误，定为 P2。

## 证据与根因

冻结快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb/README.md:103` 的快速开始直接把普通对象传给 Repository.create；同文件 :36、:44 附近的事务示例也采用此形态。`packages/rxdb/src/repository/Repository.ts:443` 的 create() 先调用 assertMountedTableSet，后者在 `packages/rxdb/src/entity/worktree-table-set-guard.ts:30` 附近从 entity.constructor 读取元数据。普通对象的 constructor 是 Object，因此还没触碰底层写入就被拒绝。核心 API 类型也要求 InstanceType<T>，并没有普通对象的自动构造重载。

本次使用 README 的实体属性声明与实际 RxDB / Repository / PGlite 内存适配器复现：connect() 成功后，create({title:write docs,done:false}) 抛 RxDBError：Target has no entity metadata: it is not decorated with @Entity。对照 create(new Todo({title:control,done:false})) 成功且返回有 id 的实体。适配器创建占位函数已替换为真实实现，故错误不是未填写示例占位导致。

同包生成的组合指南 `packages/rxdb/skills/aiao-rxdb/SKILL.md:190` 附近已采用 entityManager.instantiate 后再 create 的正确形态；README 未同步。

## 修复方向

创建示例先通过 new Todo(...) 或当前实例的 entityManager.instantiate(Todo,...) 构造实体，再交给公开/事务仓库。同步快速开始、嵌套事务与迁移示例；用最小实际实例执行一个初始化→创建→读取闭环，避免文档片段只检查方法名。

## 处理记录

### EV-01a1bb758dd975b0816b4fdbb023f452：发现

- 时间：2026-11-08T14:00:07.112Z
- 操作：review/full（parallel-001/core）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：真实公开创建入口拒绝 README 的普通对象，正确实体实例对照成功。
- 验证：`node <git-common-dir>/ai-review/v1/runs/full-main-20261108/parallel-001/core/repro-readme-create.mjs`，退出 0，输出 plainError=RxDBError/Target has no entity metadata，entitySaved=true；未改业务或原测试。
- 剩余事项：修正文档并补闭环校验，后续按 verify 复核；继续全仓评审。

### EV-01a1c0528f02752391ff234bffe0bb85：修复

- 时间：2026-11-09T21:07:00+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G04）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图，修复起点）
- 输出快照：工作区树 `69e635a6cc13240c82cc4f8c146507bb0f9b5a4b`（`ai-review snapshot --worktree`，基于 `bad25587`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：成立。`IRepository.create(entity: InstanceType<T>)` 只收实体实例，普通对象没有实体元数据，在写入前被 `assertMountedTableSet` 拒绝；README 的快速开始、事务速查第 1 / 2 条与迁移示例都传普通对象。本机用 `1b5fb4e4` 构建的 `dist` + 真实 PGlite 内存库复现：普通对象报 `Target has no entity metadata: it is not decorated with @Entity`。修正为：有实例在作用域里的示例用 `rxdb.entityManager.instantiate(Todo, {...})`（与生成的 `SKILL.md` 同一写法，同一个类绑多个实例时也指得清是哪一个），迁移示例在 `init()` 之后执行、实体类已绑定，用 `new Seed({...})`；同时点明实体实例方法永远是外部调用。
- 改动：`packages/rxdb/README.md`（快速开始的 `create`、事务速查第 1 / 2 条、迁移示例，各加一行说明）。
- 验证：文档类，没有能把 README 片段类型检查进门禁的现成机制（`scripts/check-doc-code.mjs` 只查 `website/docs` 的 import 路径与语法）。按修正后的写法在真实 PGlite 内存库上跑闭环（`/tmp/claude-rvfix/G04/probe-readme-tx.mjs`，`dist` + `RxDBAdapterPGlite` memory）：普通对象被拒；`instantiate` 后 `create` 成功，`find` 读回 1 行（`title` = `write docs`、`done` = `false`）。
- 剩余事项：同一错误写法还出现在 `website/docs/model-mutation/transaction.md:86`、`website/docs/adapters/pglite.md:164-165, 263`、`website/docs/adapters/sqlite.md:241`、`packages/rxdb-adapter-sqlite-core/README.md:28`（G10 / G06 范围，本条不改，已在报告列为跨组线索）。生成物 `packages/rxdb/skills/aiao-rxdb/SKILL.md` 若收录 README 片段需重新生成，交主会话。

### EV-01a1c0528f687171832b7e6cced891c0：复核

- 时间：2026-11-09T21:30:00+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G04，复核角色）
- 输入快照：工作区树 `69e635a6cc13240c82cc4f8c146507bb0f9b5a4b`（修复事件的输出快照）
- 输出快照：工作区树 `48c585041df86f3f253a89fde3fe63b0a1e72b88`（`ai-review snapshot --worktree`，基于 `ebba026b`（外部自动提交，含各组 WIP））
- 状态：Fixed → Resolved
- 结论：README 里四处传普通对象的 `create` 都已改成实体实例；修正后的快速开始在真实 PGlite 上完成「连接 → 创建 → 读取」闭环，旧写法照旧在写入前被拒，与 `IRepository.create(entity: InstanceType<T>)` 的类型一致。
- 验证：`/tmp/claude-rvfix/G04/probe-readme-tx.mjs` 复跑结果同修复事件；`./node_modules/.bin/prettier --check packages/rxdb/README.md` 通过。
- 剩余事项：网站与 sqlite-core README 的同类写法（见修复事件）由对应组处理。

### EV-01a1c07ec1ca74cdb5fbd9d3e2c3dd37：修复（同根因补修）

- 时间：2026-11-09T21:28:15+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G06，按主会话转交）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图）
- 输出快照：工作区树 `14bcdb7ce13ca6569bec0ab10e2745b9da40fa31`（`ai-review snapshot --worktree`，基于 `ebba026b`（外部自动提交，含各组 WIP））
- 状态：Resolved（不变）
- 结论：修复事件剩余事项里点名的 `packages/rxdb-adapter-sqlite-core/README.md:28` 是同一错误写法（事务示例 `repo.create({ title: 'inside tx' })` 传普通对象），按核心 README 的同一改法补上。
- 改动：`packages/rxdb-adapter-sqlite-core/README.md` 事务 API 示例改为 `repo.create(rxdb.entityManager.instantiate(Todo, { title: 'inside tx' }))`，注释补「仓库只收实体实例，不收普通对象」。
- 验证：`./node_modules/.bin/prettier --check packages/rxdb-adapter-sqlite-core/README.md` 通过；写法与已复核的核心 README 一致（`EntityManager.instantiate` 见 `packages/rxdb/src/entity/entity-manager.ts:306`），文档类无自动化回归。
- 剩余事项：网站文档的同类写法仍归 G10。

### EV-01a1c16b1b09740fbeb53ec60fa06a86：修复（网站文档同根因补修）

- 时间：2026-11-10T01:50:02+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G10，按主会话转交）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图）
- 输出快照：工作区树 `761aa6e49a07e2d854aa1f342bfb869970fe19e8`（`ai-review snapshot --worktree`，基于 `62cc9a51`（外部自动提交，含各组 WIP））
- 状态：Resolved（不变）
- 结论：上一事件剩余事项里的网站文档同类写法：仓库的 `create` 收普通对象，照抄即在写入前被拒。全站 grep（不含被忽略的 `website/docs/api` 生成物）只有这五处，按核心 README 的同一改法补上。
- 改动：`website/docs/model-mutation/transaction.md:87`、`website/docs/adapters/pglite.md:165`、`website/docs/adapters/pglite.md:166`、`website/docs/adapters/pglite.md:264`、`website/docs/adapters/sqlite.md:242` 改为 `create(rxdb.entityManager.instantiate(Todo, { ... }))`，相应位置补注释「仓库只收实体实例，不收普通对象」。
- 验证：`node scripts/check-doc-code.mjs website/docs/adapters website/docs/model-mutation` 通过；`--strict` 报的 7 处语法问题在 `1b5fb4e4` 同样存在（`backup.md`、`pglite.md` 另一代码块、`supabase.md`），与本次无关；`./node_modules/.bin/prettier --check` 三个文件通过。文档类无自动化回归。
- 剩余事项：无。
