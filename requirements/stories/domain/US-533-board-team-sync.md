---
id: US-533
title: 团队版看板：Supabase 同步与身份
status: Backlog
priority: Low
epic: epic-010-task-board-domain-model
created: 2026-10-19
updated: 2026-10-19
tags: [domain, board, supabase, sync, collaboration]
---

# 用户故事：团队版看板：Supabase 同步与身份

## 作为/我想要/以便

**作为** 一个具名团队的成员
**我想要** 看板在团队多设备间同步——我离线拖了任务，回网后同事能看到，而不是互相覆盖
**以便** 团队共用一块板推进工作，离线也是常态

## 价值待证

**本故事不随 [epic-010 解锁记录](../../epics/epic-010-task-board-domain-model.md#价值待证整个-epic)
解锁，保持价值待证**（与 BOM 的 US-513 阶段 B 同型）。入场条件是
[domain-research 的判据](../../domain-research/task-board.md#入场条件什么信号才值得立项)：
**出现具名团队「离线拖拽任务、回网后互相覆盖」的具体症状**，或 owner 决定把演示推进到团队版。
写出具体症状之前不得凭 Epic 惯性排期（CONVENTIONS「价值待证」）。

## 范围边界

### In Scope

- **Supabase 同步**：板 / 列 / 任务 / 标签经 [US-218](../adapter/US-218-supabase-rls-push-integrity.md) /
  [US-220](../adapter/US-220-supabase-update-push-semantics.md) 已交付的 Supabase 适配器同步
  （RLS 推送完整性、UPDATE 落库语义、逐实体回执均已 Done）
- **身份与授权**：单团队场景用 [US-027](../core/US-027-entity-permission-model.md) 的实体权限
  已足够（domain-research 结论）；多租户 RBAC 是 [US-029](../core/US-029-rbac-owner-role-permission.md)
  的范围（本身价值待证），**不重复发明**
- **离线并发合并规则**：离线双端移动同一任务 / 编辑同一任务回网后的合并——[US-527](US-527-cross-column-move-ordering.md)
  的单人语义是其设计输入，本故事定义与实现冲突语义（本地优先冲突检测底座见
  [US-308](../collaboration/US-308-branch-isolation-conflict.md)，多成员协作语义见
  [epic-006](../../epics/epic-006-working-tree-commits.md) 已交付的工作树与 commit graph，
  身份与远程提交协议**另做**——2026-10-18 优先级评审核对后的事实）
- **工作区语义**：多板、板级成员——最小方案先行（一块共享板 + 单团队），不承诺工作区 /
  组织管理

### Out of Scope

- 多租户 RBAC / 行级读隔离（US-029 价值待证）
- 评论 / @ 提醒 / 实时协作（引擎外通道，epic 非目标）
- 跨板全局搜索的工作区版本（[US-530](US-530-board-task-search.md) 只承诺板内；本故事立项时
  一并评估）
- 工作区 / 组织 / 邀请管理

## 验收标准

| #   | 前置条件                        | 操作                                               | 预期结果                                                                    | 状态 |
| --- | ------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- | ---- |
| 1   | 双端（A / B）同一团队、同一远端 | A 离线拖任务跨列，B 离线编辑同一任务标题，先后回网 | 合并结果按本故事定义的冲突规则确定；无静默覆盖，被覆盖的一侧有记录或提示    | ⬜   |
| 2   | 双端各离线建一条任务            | 先后回网                                           | 两条任务都在两端可见（无丢失）                                              | ⬜   |
| 3   | 远端启用 RLS                    | 同步看板数据                                       | 推送完整性语义沿 US-218 / US-220 已交付行为（幽灵删除、被拒 UPDATE 不复发） | ⬜   |
| 4   | 无身份上下文                    | 尝试写看板数据                                     | 按 US-027 权限模型拒绝，不静默降级                                          | ⬜   |
| 5   | 同步中的看板                    | 重开一端                                           | 同步状态恢复，重开后数据与远端一致                                          | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**引擎侧几乎全部就位，缺的是身份协议与冲突规则，不在引擎。** 双向同步（epic-002 ✅）、
Supabase RLS 推送完整性（US-218 / US-220 ✅）、本地优先冲突检测（US-308 ✅）都已交付；
「本地实体版本历史，作者由调用方提供；身份、授权与远程提交协议另做」是 epic-006 已写明的
边界（domain-research 2026-10-18 复核后的事实）。本故事真正要做的是**领域层冲突规则**：
离线双端移动同一任务，回网后谁赢——按列归属冲突（任务只能在一列）与文本字段冲突（标题 /
描述可合并或保留一侧）分开定义，且被覆盖的一侧要有痕迹。**规则先行定义、实现随本故事**；
单人版（US-527）只承诺单人语义，不提前实现冲突合并（epic 默认决策 6）。

**为什么不用 US-029。** 单团队场景下「谁能写看板」是实体级权限，US-027 已交付
（`both / system` 声明 + 公开写入口判定）；角色 / owner / 多租户是 US-029 的范围且本身
价值待证。本故事按 domain-research 结论只接 US-027，不把 US-029 拉进前置——那会把这
条价值待证的故事排到另一条价值待证的故事后面，等于两条都永不立项。

**同步实体不限读**（US-029 评审结论）：`rxdb_change` 不受业务表读策略约束，限读数据走
remote / QueryCache——本故事的远端数据流沿用该边界。

**关闭条件**：离线并发移动与编辑按已定义规则合并、无静默覆盖；同步不复发 US-218 / US-220
已修的缺陷；无身份写入被拒；重开同步恢复。

## 实现文件

- `packages/rxdb-plugin-board/` — 待建；同步配置、冲突合并规则
- `apps/dev-rxdb-supabase/` — 看板团队演示（立项后评估，不随首轮）

## References

- [epic-010 任务看板领域模型](../../epics/epic-010-task-board-domain-model.md)
- [US-527 跨列移动与批量改序的领域语义](US-527-cross-column-move-ordering.md) — 单人语义（冲突规则的设计输入）
- [US-218](../adapter/US-218-supabase-rls-push-integrity.md) / [US-220](../adapter/US-220-supabase-update-push-semantics.md) — 前置：Supabase RLS 推送完整性（✅）
- [US-027 实体操作权限模型](../core/US-027-entity-permission-model.md) — 前置：实体权限（✅）
- [US-029 RBAC](../core/US-029-rbac-owner-role-permission.md) — 价值待证，非本故事前置
- [epic-006 工作树与提交历史](../../epics/epic-006-working-tree-commits.md) — 本地优先冲突底座（✅，身份另做）
- [domain-research 任务看板](../../domain-research/task-board.md) — 入场条件与「团队版另有身份和远端策略」
