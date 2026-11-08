---
id: RV-01a1bb758daf77e0aacafcbfc5e3f585
title: '核心 README 的创建示例传普通对象，公开仓库立即拒绝'
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
