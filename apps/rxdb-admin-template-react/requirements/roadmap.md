# Admin 应用路线图

当前在本仓库孵化 Angular / React / Vue 三端模板，未来独立导出暂不进入实施批次。状态见 [status-overview](status-overview.md)，不在本页维护第二份状态。

## 当前评审批次

| 故事 | 本地验收与合入条件 |
| --- | --- |
| [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md) 完整客户端国际化 | 三端六项 AC 本地通过；见 [国际化证据](plans/client-i18n-verification.md)，待统一评审与合并 |
| [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) 自定义页面 | Dashboard、桌面／移动导航、深链刷新、页签、面包屑、命令面板与偏好扩展本地通过；见 [扩展指南](plans/custom-pages-navigation.md)，待统一评审与合并 |

公共元数据呈现能力与应用接线在同一变更内评审、验证。Done 仍以合并并补齐同层验收证据为准。

## 协作闭环待排期

以下故事已经把产品行为、权限边界、离线边界和验收条件写清，当前均为 Backlog；实施时按依赖顺序推进，不把底层插件已有能力当作应用闭环证据。

### 第一阶段：身份、团队与任务草稿

- [ADMIN-US-201](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md) Supabase 邮箱验证码登录与会话恢复
- [ADMIN-US-202](stories/collaboration/ADMIN-US-202-team-membership-workspace.md) 团队邀请、成员与工作区选择
- [ADMIN-US-203](stories/collaboration/ADMIN-US-203-permission-server-isolation.md) 团队操作权限与服务端隔离
- [ADMIN-US-204](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) 本地数据上下文隔离与显式导入
- [ADMIN-US-205](stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md) 任务草稿与连续编辑
- [ADMIN-US-206](stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md) 草稿云同步、跨设备续作与离线恢复

### 第二阶段：数据 PR、审核与合并

- [ADMIN-US-207](stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md) 数据变更 PR 创建与生命周期
- [ADMIN-US-208](stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md) 数据 PR 讨论、评论与变更定位
- [ADMIN-US-209](stories/collaboration/ADMIN-US-209-review-approval.md) 数据 PR 审核、批准与要求修改
- [ADMIN-US-210](stories/collaboration/ADMIN-US-210-diff-checks.md) 数据差异展示与合并前检查
- [ADMIN-US-211](stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md) 三方冲突检测与合并预览
- [ADMIN-US-212](stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) 有权限合并与原子提交
- [ADMIN-US-213](stories/collaboration/ADMIN-US-213-history-audit-restore.md) 提交历史、合并审计与版本恢复草稿

### 后续增强

- [ADMIN-US-214](stories/collaboration/ADMIN-US-214-comment-notifications.md) 评论通知与增强讨论协作
- [ADMIN-US-215](stories/collaboration/ADMIN-US-215-presence.md) 在线成员与当前查看状态
- [ADMIN-US-216](stories/collaboration/ADMIN-US-216-multi-level-approval.md) 多级审批与可配置合并规则

## 既有前置

[ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) 等待一组真实的新业务关联实体、字段、关系与非 `assets` 命名空间；确定后验证新业务 CRUD、关联筛选、搜索、Dashboard、刷新重开和备份恢复，同时保留默认资产回归。Dashboard 已验证非 CRUD 页面路径，自定义页面不再依赖另找实例。

大日志量活动查询和构建体积治理继续按 [优化清单 T04 / T05](plans/nexus-template-optimization-tasks.md) 单独确认范围与预算，不并入已完成的国际化或页面扩展验收。

## 长期目标

独立仓库启动模板、OAuth/企业 SSO、桌面宿主和跨产品通知见 [future-requirements](future-requirements.md)，需在协作首版闭环完成并具备具体使用场景后另行立项。
