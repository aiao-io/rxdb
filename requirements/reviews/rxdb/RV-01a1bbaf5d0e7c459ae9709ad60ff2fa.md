---
id: RV-01a1bbaf5d0e7c459ae9709ad60ff2fa
title: '子类重声明字段会误删父类同名的显式实体级 CHECK'
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
updated: 2026-11-09
anchors:
  - 'packages/rxdb/src/entity/metadata-transition.ts#transitionMetadata'
affected_projects:
  - rxdb-adapter-sqlite-core
  - rxdb-adapter-pglite
related_findings: []
pr: null
---

# RV-01a1bbaf5d0e7c459ae9709ad60ff2fa：子类重声明字段会误删父类同名的显式实体级 CHECK

## 问题与影响

父类用 checks 显式声明名为 qty 的实体级约束（例如 qty > 0）；子类只为 qty 字段补显示名、没有声明任何 checks。转换后父类的显式 CHECK 从子类 checkMap 消失，注册期仍返回零违规，两类本地适配器建新表时都不再生成该约束。违反实体级 CHECK 按 name 继承、仅由子类同名约束覆盖的契约。需要约束名与被重声明字段同名，按边界 P2；本次确认元数据丢失及建表消费链，未声称实测了存量库损坏。

## 证据与根因

冻结快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb/src/entity/metadata-transition.ts:172` 至 :184 的属性级 check 语法糖处理，在子类属性未带 check 时无条件 checkMap.delete(property.name)。Map 同时保存显式实体级 checks，没有标记条目来源，因此本想摘除父属性语法糖的删除也删掉父类的显式命名约束。

`packages/rxdb/src/entity/entity-options.interface.ts:253` 附近声明实体级约束按 name 合并。现有 `packages/rxdb/src/__tests__/entity/check-constraint.spec.ts:616` 用例声称「父的显式 check 仍在」，但父显式约束叫 base_only，未覆盖与字段同名的情况。此文件只作为上下文，不登记本组覆盖。

实际导出有界复现：parent={name:'Parent',properties:[{name:'qty',type:'integer'}],checks:[{name:'qty',rule:{combinator:'and',rules:[{field:'qty',operator:'>',value:0}]}}]}；子类 properties=[] 时 checkNames=['qty']；仅改为 properties=[{name:'qty',type:'integer',displayName:'数量'}] 后 checkNames=[]；两者 validateEntityMetadata 都返回 []。

`packages/rxdb-adapter-sqlite-core/src/table/create_table_sql.ts:252` 与 `packages/rxdb-adapter-pglite/src/table/create_table_sql.ts:104` 均只遍历 checkMap 来生成 CHECK，缺失会传播到实际 DDL；适配器不另行恢复父声明。

## 修复方向

区分属性语法糖与显式命名 CHECK 的来源，只在重声明字段时摘除相应的继承语法糖；保留显式实体约束，除非子类显式给出同名覆盖。补父显式约束与字段同名、同层显式覆盖语法糖、三层继承等回归；核对两后端 DDL。

## 处理记录

### EV-01a1bbaf5d3971f387c97ac7b55bd341：发现

- 时间：2026-11-08T15:03:14.492941+00:00
- 操作：review/full（parallel-001/core-entity）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅记录）
- 状态：未登记 → Open
- 结论：字段重声明的语法糖清理误删显式 CHECK，注册期无提示。
- 验证：Node + esbuild 内存打包后调用实际 transitionMetadata / validateEntityMetadata，退出 0；两组 checkNames 与违规输出见证据。静态核对两后端实际 DDL 消费；未重复数据库全套实验。
- 剩余事项：正式红灯回归与修复交 fix/verify。

### EV-01a1c0528a0572ea9e218ac1968d9d0a：修复

- 时间：2026-11-09T21:01:00+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G04）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图，修复起点）
- 输出快照：工作区树 `69e635a6cc13240c82cc4f8c146507bb0f9b5a4b`（`ai-review snapshot --worktree`，基于 `bad25587`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：成立。`transitionMetadata` 在子类重声明属性（不带 `check`）时无条件 `checkMap.delete(property.name)`（`packages/rxdb/src/entity/metadata-transition.ts:172`～184，`1b5fb4e4`），而 checkMap 同时装着显式实体级 CHECK，没有来源标记，父类显式声明、恰好与字段同名的约束被一并删掉，违反 AC#17「按 name 继承、只被同名约束覆盖」。修法：另记一份「当前来自属性级语法糖」的名字集合，属性带 `check` 时登记、显式 `checks` 覆盖同名时注销，重声明属性只摘仍属语法糖的那条。子类自己的属性级语法糖照旧覆盖父类同名显式约束（同名覆盖不变）。
- 改动：`packages/rxdb/src/entity/metadata-transition.ts`（`sugarCheckNames` 集合与两处登记 / 注销）；新增 `packages/rxdb/src/__tests__/entity/check-constraint-inheritance.spec.ts`（父显式同名约束在子类重声明后仍在且编译为 `("qty" > 0)`、注册期零违规；继承来的语法糖照旧摘除；三层继承中间层显式覆盖祖先语法糖后孙类重声明仍保留；子类自身语法糖覆盖父类同名显式约束）。
- 验证：修复前该文件 2 failed（`expected [] to deeply equal [ 'qty' ]`，父显式约束与三层继承两条）、2 passed；修复后 4 passed，`check-constraint.spec.ts` 同跑全绿。两后端 DDL 用临时探针核对（放在被忽略的 `src/__tests__/tmp/`，跑完即删）：`rxdb-adapter-pglite` 与 `rxdb-adapter-sqlite-core` 的 `create_table_sql` 对子类都生成 `CONSTRAINT "ck_G04Child_qty_…" CHECK (("qty" > 0))`（两包测试经 alias / tsconfig paths 走核心源码）。eslint 与 lib `tsc --noEmit` 通过。
- 剩余事项：已有库若按旧元数据建过子类表（缺这条 CHECK），升级后 `connect()` 会按约束漂移报 `RxDBConstraintDriftError`，需迁移补约束——这是契约本来的要求（表上缺了声明的约束），CHANGELOG 修复条目须写明，交主会话。

### EV-01a1c0528a4c7d1e8bd329aef29df14e：复核

- 时间：2026-11-09T21:26:00+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G04，复核角色）
- 输入快照：工作区树 `69e635a6cc13240c82cc4f8c146507bb0f9b5a4b`（修复事件的输出快照）
- 输出快照：工作区树 `48c585041df86f3f253a89fde3fe63b0a1e72b88`（`ai-review snapshot --worktree`，基于 `ebba026b`（外部自动提交，含各组 WIP））
- 状态：Fixed → Resolved
- 结论：父类显式、与字段同名的 CHECK 在子类重声明字段后保留并进入两后端 DDL；继承来的属性级语法糖仍按原规则摘除，子类自身语法糖仍覆盖同名约束，AC#17 的四种组合各有用例。只有命中原触发条件（约束名与被重声明字段同名）的实体，约束集合才与修复前不同。
- 验证：整包复跑（21:10～21:20）：`packages/rxdb` 下 `npx vitest run --maxWorkers=3`，排除 G03 / G05 正在推进的两份先红用例（不归本组）→ 171 files / 2804 passed / 1 skipped，覆盖率 95.62% / 92.48% / 96.02% / 96.27%（含既有 `check-constraint.spec.ts`、`constraint-drift.spec.ts`）；`pnpm nx lint rxdb --exclude-task-dependencies` 通过；lib `tsc --noEmit` 0 错；`rxdb-adapter-sqlite-core` 整包 74 files / 1613 passed / 21 skipped；`rxdb-adapter-pglite` 整包 190 files 中 188 passed，2 条红在工作树一致性的保存写回路径（G05 WIP），与约束编译无关。
- 剩余事项：无（CHANGELOG 说明见修复事件）。
