---
id: US-306b
title: 缓存区与提交状态机
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-15
updated: 2026-08-15
tags: [collaboration, index, staging, diff, commit, concurrency]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖持久工作树，但可用核心 API 独立完成 stage → refresh → commit
- [x] Negotiable: diff DTO 的字段组织和物理 index 表名可调整
- [x] Valuable: 用户能选择性提交且不会生成不可重放 index
- [x] Estimable: 操作、revision、依赖闭包和冲突口径已冻结
- [x] Small: 不含写入口捕获、三框架 UI、restore 或 branch switch
- [x] Testable: 核心状态机和跨 realm CAS 都有确定性 fixture
-->

# 用户故事：缓存区与提交状态机

> 父契约见 [US-306](./US-306-working-tree-index.md)。本故事依赖
> [US-306a](./US-306a-working-tree-capture.md) 的持久工作树。

## 作为/我想要/以便

**作为** 需要控制提交边界的开发者
**我想要** 查看差异、选择可独立重放的变更并提交
**以便** 未暂存修改不会被覆盖，跨 realm 竞争不会静默丢数据

## 范围边界

### In Scope

- `status()` / `diff(scope?)` 的核心 API 和稳定 DTO
- `IndexState` / `IndexEntry`、stage/unstage/stage all/clear index
- 基于同实体顺序、完整事务、schema relation graph 与实际行引用的依赖闭包
- `commit(message, options)`、operation ID 幂等、residual rebase
- `discardWorkingTree()` 与 index 清理
- working-tree/index/head/active token revision CAS
- 一次性 `CommitConflict` 与 durable `status().conflicted` 的边界
- IndexEntry 加密 envelope 与核心类型/API baseline

### Out of Scope

- 工作树写入口捕获，归 US-306a
- 三框架公开入口和性能门禁，归 US-306c
- restore session 与 branch switch，分别归 US-307 / US-308

## 验收场景

1. **Given** 工作树有两个独立修改，**When** 只 stage 其中一个并刷新，**Then** index snapshot、顺序、依赖和事务边界保持；commit 只包含该闭包，另一个修改继续 unstaged。
2. **Given** index 为空或 message/authorId/operationId 非法，**When** commit，**Then** 在持久状态变化前拒绝。
3. **Given** stage 后同一实体再次编辑，**When** status/diff 或 commit 原 snapshot，**Then** staged snapshot 不变，后续编辑保留为 unstaged；re-stage 才原子替换 snapshot。
4. **Given** T1 插入 A/B、T2 更新 A，**When** 只 stage T2，**Then** 闭包包含 T1+T2；unstage T1 同时移除依赖 T2。
5. **Given** T1 插入 Parent P、T2 插入 Child C 并引用 P，**When** 只 stage T2，**Then** 闭包包含 T1 并按 Parent→Child 重放；Child DELETE→Parent DELETE 与关系键 UPDATE 遵守反向依赖。
6. **Given** relation graph 存在不可拆分环，**When** 环内单元可作为同一原子集合重放，**Then** 全部纳入；无法形成合法闭包时返回 `index_dependency_cycle` 且 index 零变化。
7. **Given** 两个 realm 从同一 revision stage/commit，**When** 条件更新竞争，**Then** 只有一个成功，失败方收到 expected/actual revision 且无半成品。
8. **Given** 普通 stage/commit CAS 失败，**When** 刷新后调用 status，**Then** 状态按最新持久数据重建，不因历史失败永久显示 conflicted。
9. **Given** active restore session 的 expected revision 与当前值分叉，**When** 调用 status，**Then** 返回 durable conflicted；session 解决或删除后该状态消失。
10. **Given** commit 响应丢失，**When** 相同 operation ID 与相同 payload 重试，**Then** 返回原 commit；payload 不同返回 `idempotency_key_reused`。
11. **Given** 工作树含未提交修改和 index，**When** discardWorkingTree，**Then** 业务投影回到 HEAD、index 清空、commit 图不变；外键依赖整体回滚。
12. **Given** 加密字段被 stage/commit，**When** 扫描 IndexEntry 原始 dump，**Then** 明文哨兵零命中。

## 核心操作契约

| 操作 | revision 校验 | 成功变化 |
| ---- | ------------- | -------- |
| `status()` / `diff()` | 读取一致快照 | 无 |
| `stage()` / re-stage | active + working-tree + index | index；工作树不变 |
| `unstage()` / `clearIndex()` | active + index | index |
| `commit()` | active + head + index | head、index、working-tree residual rebase |
| `discardWorkingTree()` | active + head + working-tree + index | working-tree；index 非空时同时变化 |

`CommitConflict` 只描述一次失败命令。v1 不持久化通用冲突表；`status().conflicted` 只由 durable
`WorkingTreeRestoreSession` 派生，不能依赖页面内存保留一次旧 CAS 错误。

## 测试要求

- 核心包覆盖率不低于 90%，先写 index 不可重放和 residual edit 丢失的失败用例。
- 依赖闭包 fixture 覆盖同实体链、多实体事务、跨事务父子关系、DELETE 逆序、关系键 UPDATE 与环。
- 每个成功 index 都必须通过“从 HEAD 在空投影重放”的通用断言。
- 双 realm fixture 覆盖 stage、re-stage、commit、discard CAS；不用固定延时。
- API baseline 与类型契约覆盖全部核心 DTO、选项和类型化错误。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — status/diff/index/commit 状态机
- `packages/rxdb/src/system/` — IndexState / IndexEntry
- `packages/rxdb/src/__tests__/version/` — 闭包、CAS、幂等与 residual rebase
- `requirements/api-baseline/rxdb.json`

