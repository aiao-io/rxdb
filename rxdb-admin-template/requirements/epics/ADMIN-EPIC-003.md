---
id: ADMIN-EPIC-003
status: In Progress
startDate: 2026-11-16
targetDate: TBD
owner: jimmy
---

# 数据变更中心与合并治理

## 愿景

把团队数据变更中心做成类似 GitHub PR 的协作入口：任务作者持续提交，成员围绕可定位的数据差异讨论和审核，有目标分支合并权的人在服务端条件满足后合并，最终结果可追溯并可安全恢复。

## 目标

- [ ] 创建数据 PR 并管理草稿、审核、关闭、重开和合并生命周期（[ADMIN-US-207](../stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md)）。
- [ ] 提供四页签讨论、版本和字段级评论（[ADMIN-US-208](../stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md)）。
- [ ] 支持绑定最终候选的批准、多人意见聚合及阻塞撤销审计（[ADMIN-US-209](../stories/collaboration/ADMIN-US-209-review-approval.md)）。
- [ ] 展示整单差异并检查最终候选结果（[ADMIN-US-210](../stories/collaboration/ADMIN-US-210-diff-checks.md)）。
- [ ] 支持三方冲突处理、不可变候选与最终合并预览（[ADMIN-US-211](../stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md)）。
- [ ] 允许有权限成员执行服务端原子合并并生成审计（[ADMIN-US-212](../stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md)）。
- [ ] 保留提交/审核/合并历史并支持恢复为新草稿（[ADMIN-US-213](../stories/collaboration/ADMIN-US-213-history-audit-restore.md)）。
- [ ] 后续增强评论通知、Presence 和多级审批（[ADMIN-US-214](../stories/collaboration/ADMIN-US-214-comment-notifications.md)、[ADMIN-US-215](../stories/collaboration/ADMIN-US-215-presence.md)、[ADMIN-US-216](../stories/collaboration/ADMIN-US-216-multi-level-approval.md)）。

共享规则见 [协作首版共享契约](../collaboration-contract.md) C04～C06。实施顺序为 207 → 208/210 → 211 → 209 → 212 → 213；请求审核允许先讨论，批准必须等最终候选及检查完成。

## 故事

本清单只列范围，状态见 [status-overview](../status-overview.md)。

- [ADMIN-US-207 数据变更 PR 创建与生命周期](../stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md) (High)
- [ADMIN-US-208 数据 PR 讨论、评论与变更定位](../stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md) (Medium)
- [ADMIN-US-209 数据 PR 审核、批准与要求修改](../stories/collaboration/ADMIN-US-209-review-approval.md) (High)
- [ADMIN-US-210 数据差异展示与合并前检查](../stories/collaboration/ADMIN-US-210-diff-checks.md) (High)
- [ADMIN-US-211 三方冲突检测与合并预览](../stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md) (High)
- [ADMIN-US-212 有权限合并与原子提交](../stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) (High)
- [ADMIN-US-213 提交历史、合并审计与版本恢复草稿](../stories/collaboration/ADMIN-US-213-history-audit-restore.md) (Medium)
- [ADMIN-US-214 评论通知与增强讨论协作](../stories/collaboration/ADMIN-US-214-comment-notifications.md) (Low)
- [ADMIN-US-215 在线成员与当前查看状态](../stories/collaboration/ADMIN-US-215-presence.md) (Low)
- [ADMIN-US-216 多级审批与可配置合并规则](../stories/collaboration/ADMIN-US-216-multi-level-approval.md) (Low)

## 非目标

- 首版不做记录级部分提交、自动合并多个 PR、跨团队合并或直接回滚共享头。
- 首版不接 GitHub 代码 PR、外部签名、邮件/IM 通知和强制字段锁。
- 评论通知、Presence 和多级审批虽已建故事，但属于后续优先级，不计入首版闭环关闭条件。
