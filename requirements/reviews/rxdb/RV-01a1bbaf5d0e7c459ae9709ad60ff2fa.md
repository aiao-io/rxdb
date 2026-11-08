---
id: RV-01a1bbaf5d0e7c459ae9709ad60ff2fa
title: '子类重声明字段会误删父类同名的显式实体级 CHECK'
project: rxdb
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb'
status: Open
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-08
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
