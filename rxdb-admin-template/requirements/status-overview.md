# Admin 产品状态总览

真相源为各 story 的 YAML `status`，应用能力不能继承平台故事状态。16 个协作故事已完成需求拆分，尚未代表代码实现或 Supabase 环境验收。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 2    |
| 🚧 In Progress | 0    |
| 👀 In Review   | 3    |
| 📝 Backlog     | 17   |
| 🚫 Blocked     | 0    |
| **合计**       | 22   |

## 进行中（0 条）

无。

## 待评审（3 条）

完整客户端国际化、三端产品需求统一管理和 Dashboard 自定义页面扩展已通过本地验收，待统一评审、合并与 PR 引用。新业务实体替换保留 Backlog，等待业务实体与命名空间输入。

## 按 Epic 索引

### ADMIN-EPIC-001 应用模板孵化

- ✅ [ADMIN-US-001 应用需求管理与结构门禁](stories/platform/ADMIN-US-001-application-requirements.md)
- ✅ [ADMIN-US-002 应用标识与存储配置](stories/platform/ADMIN-US-002-application-configuration.md)
- 👀 [ADMIN-US-003 完整客户端国际化接入](stories/platform/ADMIN-US-003-client-i18n.md)
- 👀 [ADMIN-US-004 三端共用产品根需求与统一门禁](stories/platform/ADMIN-US-004-product-requirements.md)
- ⬜ [ADMIN-US-101 示例实体替换与元数据贯通](stories/domain/ADMIN-US-101-replace-sample-domain.md)
- 👀 [ADMIN-US-102 自定义页面与导航扩展路径](stories/domain/ADMIN-US-102-custom-pages-navigation.md)

### ADMIN-EPIC-002 认证与团队工作区

- ⬜ [ADMIN-US-201 Supabase 邮箱验证码登录与会话恢复](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md)
- ⬜ [ADMIN-US-202 团队邀请、成员与工作区选择](stories/collaboration/ADMIN-US-202-team-membership-workspace.md)
- ⬜ [ADMIN-US-203 团队操作权限与服务端隔离](stories/collaboration/ADMIN-US-203-permission-server-isolation.md)
- ⬜ [ADMIN-US-204 本地数据上下文隔离与显式导入](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md)
- ⬜ [ADMIN-US-205 任务草稿与连续编辑](stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md)
- ⬜ [ADMIN-US-206 草稿云同步、跨设备续作与离线恢复](stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md)

### ADMIN-EPIC-003 数据变更中心与合并治理

- ⬜ [ADMIN-US-207 数据变更 PR 创建与生命周期](stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md)
- ⬜ [ADMIN-US-208 数据 PR 讨论、评论与变更定位](stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md)
- ⬜ [ADMIN-US-209 数据 PR 审核、批准与要求修改](stories/collaboration/ADMIN-US-209-review-approval.md)
- ⬜ [ADMIN-US-210 数据差异展示与合并前检查](stories/collaboration/ADMIN-US-210-diff-checks.md)
- ⬜ [ADMIN-US-211 三方冲突检测与合并预览](stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md)
- ⬜ [ADMIN-US-212 有权限合并与原子提交](stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md)
- ⬜ [ADMIN-US-213 提交历史、合并审计与版本恢复草稿](stories/collaboration/ADMIN-US-213-history-audit-restore.md)
- ⬜ [ADMIN-US-214 评论通知与增强讨论协作](stories/collaboration/ADMIN-US-214-comment-notifications.md)
- ⬜ [ADMIN-US-215 在线成员与当前查看状态](stories/collaboration/ADMIN-US-215-presence.md)
- ⬜ [ADMIN-US-216 多级审批与可配置合并规则](stories/collaboration/ADMIN-US-216-multi-level-approval.md)
