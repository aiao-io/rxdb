# Admin 产品状态总览

故事 YAML `status` 是唯一真相源；本页只做派生索引。当前协作代码已落地到产品私有包并完成本地验证，但未合入 main、未完成正式部署，因此协作故事统一保持 `In Review`，不能写成 `Done`。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---: |
| ✅ Done        |    2 |
| 🚧 In Progress |    2 |
| 👀 In Review   |   21 |
| 📝 Backlog     |    2 |
| 🚫 Blocked     |    0 |
| **合计**       |   27 |

## 进行中（2 条）

- [ADMIN-US-218](stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md) 差量提交与有界命令成本：切片 A～E 全部落地，AC#1～#7 已关闭（AC#1 经空闲机器复测与两组对照确认命令耗时与提交数无关，AC#6 随 ADMIN-US-219 关闭）；一条评论由基线 2.74 s / 6.77 MB WAL 降到约 7 ms / 4 KB。剩 AC#8：ADMIN-US-201～216 在新实现上的整体回归。
- [ADMIN-US-221](stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md) 团队任务草稿落在 RxDB 工作树：平台 US-316 / US-317 与 exchange 子路径已就绪；正在做 221-A（提交协议切换为平台交换格式），之后 221-B（客户端改用工作树与模型驱动界面）。

## 待评审（21 条）

- [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md) 完整客户端国际化
- [ADMIN-US-004](stories/platform/ADMIN-US-004-product-requirements.md) 三端共用产品根需求与统一门禁
- [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) 自定义页面与导航扩展
- [ADMIN-US-201](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md) Supabase 邮箱验证码登录与会话恢复
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
- [ADMIN-US-219](stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md) 协作读取、实时与身份校验改用 Supabase 原生能力：RLS 只读投影、私有频道 Broadcast 与 Presence、本地验签已在本地隔离 Supabase 栈验收，待评审合并
- [ADMIN-US-220](stories/collaboration/ADMIN-US-220-supabase-only-deployment.md) 协作服务只部署 Supabase 即可运行：Edge Function 与 Node 两个入口共用一套引擎，专用数据库角色、可重试错误与资源余量已在本地验收；全新真实项目上的部署由 ADMIN-US-217 承接

## 待输入（1 条）

- [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) 示例实体替换与元数据贯通：缺少真实业务实体、字段、关系和非 `assets` 命名空间，不能自行发明领域完成需求。

## 待排期（1 条）

按 [协作后端收敛实施计划](plans/collaboration-convergence-tasks.md) 的顺序排列：

- [ADMIN-US-217](stories/collaboration/ADMIN-US-217-production-deployment-operations.md) 协作服务生产部署与运维闭环：协作故事关闭所需的部署、真实邮箱与长期运行证据，排在 218～220 之后。

## 按 Epic 索引

### ADMIN-EPIC-001 应用模板孵化

- ✅ [ADMIN-US-001 应用需求管理与结构门禁](stories/platform/ADMIN-US-001-application-requirements.md)
- ✅ [ADMIN-US-002 应用标识与存储配置](stories/platform/ADMIN-US-002-application-configuration.md)
- 👀 [ADMIN-US-003 完整客户端国际化接入](stories/platform/ADMIN-US-003-client-i18n.md)
- 👀 [ADMIN-US-004 三端共用产品根需求与统一门禁](stories/platform/ADMIN-US-004-product-requirements.md)
- ⬜ [ADMIN-US-101 示例实体替换与元数据贯通](stories/domain/ADMIN-US-101-replace-sample-domain.md)
- 👀 [ADMIN-US-102 自定义页面与导航扩展路径](stories/domain/ADMIN-US-102-custom-pages-navigation.md)

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

- 🚧 [ADMIN-US-218 差量提交与有界命令成本](stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md)
- 👀 [ADMIN-US-219 协作读取、实时与身份校验改用 Supabase 原生能力](stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md)
- 👀 [ADMIN-US-220 协作服务只部署 Supabase 即可运行](stories/collaboration/ADMIN-US-220-supabase-only-deployment.md)
- ⬜ [ADMIN-US-217 协作服务生产部署与运维闭环](stories/collaboration/ADMIN-US-217-production-deployment-operations.md)
- 🚧 [ADMIN-US-221 团队任务草稿落在 RxDB 工作树](stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md)
