# Admin 产品状态总览

故事 YAML `status` 是唯一真相源；本页只做派生索引。`Done` 在实现 PR 内按 AC 证据直接标；停在 `In Review` 的故事要么自己还有未 ✅ 的 AC，要么硬依赖尚未 `Done`。正式部署由 ADMIN-US-217 承接，不是其他故事的关闭条件。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---: |
| ✅ Done        |    8 |
| 🚧 In Progress |    1 |
| 👀 In Review   |   17 |
| 📝 Backlog     |    1 |
| 🚫 Blocked     |    0 |
| **合计**       |   27 |

## 进行中（1 条）

- [ADMIN-US-217](stories/collaboration/ADMIN-US-217-production-deployment-operations.md) 协作服务生产部署与运维闭环：按 owner 决定先在本机 Docker 上做完整的自托管 Supabase 预演（证据标 ⚠️），上线前在真实环境复验。

## 待评审（17 条）

还有 AC 等待真实环境证据的 2 条：

- [ADMIN-US-201](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md) Supabase 邮箱验证码登录与会话恢复：AC#2 缺生产 SMTP 投递证据，AC#3 缺验证码自然到期的真实邮箱场景，由 ADMIN-US-217 的部署提供。
- [ADMIN-US-220](stories/collaboration/ADMIN-US-220-supabase-only-deployment.md) 协作服务只部署 Supabase 即可运行：AC#1 还差在全新的真实 Supabase 项目上部署并跑三端，由 ADMIN-US-217 承接。

AC 已全部通过、等待硬依赖 ADMIN-US-201 关闭的 15 条：

- [ADMIN-US-202](stories/collaboration/ADMIN-US-202-team-membership-workspace.md) 团队邀请、成员与工作区选择
- [ADMIN-US-203](stories/collaboration/ADMIN-US-203-permission-server-isolation.md) 团队操作权限与服务端隔离
- [ADMIN-US-204](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) 本地数据上下文隔离与显式导入
- [ADMIN-US-205](stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md) 任务草稿与连续编辑
- [ADMIN-US-206](stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md) 草稿云同步、跨设备续作与离线恢复
- [ADMIN-US-207](stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md) 数据变更 PR 创建与生命周期
- [ADMIN-US-208](stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md) 数据 PR 讨论、评论与变更定位
- [ADMIN-US-209](stories/collaboration/ADMIN-US-209-review-approval.md) 数据 PR 审核、批准与要求修改
- [ADMIN-US-210](stories/collaboration/ADMIN-US-210-diff-checks.md) 数据差异展示与合并前检查
- [ADMIN-US-211](stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md) 三方冲突检测与合并预览
- [ADMIN-US-212](stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) 有权限合并与原子提交
- [ADMIN-US-213](stories/collaboration/ADMIN-US-213-history-audit-restore.md) 提交历史、合并审计与版本恢复草稿
- [ADMIN-US-214](stories/collaboration/ADMIN-US-214-comment-notifications.md) 评论通知与增强讨论协作
- [ADMIN-US-215](stories/collaboration/ADMIN-US-215-presence.md) 在线成员与当前查看状态
- [ADMIN-US-216](stories/collaboration/ADMIN-US-216-multi-level-approval.md) 多级审批与可配置合并规则

## 待输入（1 条）

- [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) 示例实体替换与元数据贯通：缺少真实业务实体、字段、关系和非 `assets` 命名空间，不能自行发明领域完成需求。

## 待排期（0 条）

当前没有待排期的故事。

## 按 Epic 索引

### ADMIN-EPIC-001 应用模板孵化

- ✅ [ADMIN-US-001 应用需求管理与结构门禁](stories/platform/ADMIN-US-001-application-requirements.md)
- ✅ [ADMIN-US-002 应用标识与存储配置](stories/platform/ADMIN-US-002-application-configuration.md)
- ✅ [ADMIN-US-003 完整客户端国际化接入](stories/platform/ADMIN-US-003-client-i18n.md)
- ✅ [ADMIN-US-004 三端共用产品根需求与统一门禁](stories/platform/ADMIN-US-004-product-requirements.md)
- ⬜ [ADMIN-US-101 示例实体替换与元数据贯通](stories/domain/ADMIN-US-101-replace-sample-domain.md)
- ✅ [ADMIN-US-102 自定义页面与导航扩展路径](stories/domain/ADMIN-US-102-custom-pages-navigation.md)

### ADMIN-EPIC-002 认证与团队工作区

- 👀 [ADMIN-US-201 Supabase 邮箱验证码登录与会话恢复](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md)
- 👀 [ADMIN-US-202 团队邀请、成员与工作区选择](stories/collaboration/ADMIN-US-202-team-membership-workspace.md)
- 👀 [ADMIN-US-203 团队操作权限与服务端隔离](stories/collaboration/ADMIN-US-203-permission-server-isolation.md)
- 👀 [ADMIN-US-204 本地数据上下文隔离与显式导入](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md)
- 👀 [ADMIN-US-205 任务草稿与连续编辑](stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md)
- 👀 [ADMIN-US-206 草稿云同步、跨设备续作与离线恢复](stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md)

### ADMIN-EPIC-003 数据变更中心与合并治理

- 👀 [ADMIN-US-207 数据变更 PR 创建与生命周期](stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md)
- 👀 [ADMIN-US-208 数据 PR 讨论、评论与变更定位](stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md)
- 👀 [ADMIN-US-209 数据 PR 审核、批准与要求修改](stories/collaboration/ADMIN-US-209-review-approval.md)
- 👀 [ADMIN-US-210 数据差异展示与合并前检查](stories/collaboration/ADMIN-US-210-diff-checks.md)
- 👀 [ADMIN-US-211 三方冲突检测与合并预览](stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md)
- 👀 [ADMIN-US-212 有权限合并与原子提交](stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md)
- 👀 [ADMIN-US-213 提交历史、合并审计与版本恢复草稿](stories/collaboration/ADMIN-US-213-history-audit-restore.md)
- 👀 [ADMIN-US-214 评论通知与增强讨论协作](stories/collaboration/ADMIN-US-214-comment-notifications.md)
- 👀 [ADMIN-US-215 在线成员与当前查看状态](stories/collaboration/ADMIN-US-215-presence.md)
- 👀 [ADMIN-US-216 多级审批与可配置合并规则](stories/collaboration/ADMIN-US-216-multi-level-approval.md)

### ADMIN-EPIC-004 协作后端收敛、部署与运维

- ✅ [ADMIN-US-218 差量提交与有界命令成本](stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md)
- ✅ [ADMIN-US-219 协作读取、实时与身份校验改用 Supabase 原生能力](stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md)
- 👀 [ADMIN-US-220 协作服务只部署 Supabase 即可运行](stories/collaboration/ADMIN-US-220-supabase-only-deployment.md)
- 🚧 [ADMIN-US-217 协作服务生产部署与运维闭环](stories/collaboration/ADMIN-US-217-production-deployment-operations.md)
- ✅ [ADMIN-US-221 团队任务草稿落在 RxDB 工作树](stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md)
