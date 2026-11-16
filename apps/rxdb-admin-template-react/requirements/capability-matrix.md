# Admin 应用能力矩阵

本表区分源码可见的现有接线、应用故事状态和待实施的协作闭环。当前执行证据见 [verification-report](verification-report.md)。协作故事的存在不代表认证、同步或合并已经实现。

| 能力 | 当前入口与边界 | 应用验收 |
| --- | --- | --- |
| 真实数据 Dashboard 与最近活动 | [Dashboard](../src/app/pages/dashboard-model.ts)、[持久化活动查询](../src/app/pages/dashboard-activity-source.ts)；三端懒加载页面与同一数据契约 | 两阶段本地验证通过，见 [三端验收](plans/nexus-dashboard-verification.md)；页面扩展三项 AC 的本地验收见 [优化清单 T02](plans/nexus-template-optimization-tasks.md#t02--p1--用-dashboard-完成自定义页面扩展验收) |
| 本地实体 CRUD、关联与筛选 | [ENTITIES](../src/app/entities/asset-entities.ts)、[EntityListPage](../src/app/pages/entity-list-page.tsx)；默认资产样例 | 原场景见平台 [US-526](../../../requirements/stories/domain/US-526-admin-workbench.md)，跨业务替换由 [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) 验收 |
| 全文搜索与记录跳转 | [SearchPage](../src/app/pages/search-page.tsx)、[createRecordSearchSource](../src/app/shell/record-search.ts) | 现有样例接线可读；新实体显示名与跳转待 [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) |
| 刷新重开与备份恢复 | [setup_rxdb](../src/app/rxdb/setup_rxdb.ts)、[backup-ops](../src/app/backup/backup-ops.ts) | 固定后端组合；原闭环见平台 [US-527](../../../requirements/stories/domain/US-527-admin-backup-restore.md) |
| 主题、布局、页签、命令面板与锁屏 | [workbenchShell](../src/app/shell/workbench-shell.ts) | 已接线，不推断认证或服务端权限；平台 US-530～533 状态独立维护 |
| 应用级需求与门禁 | [ADMIN-US-001](stories/platform/ADMIN-US-001-application-requirements.md) | 当前批次，本地证据见验收台账 |
| 统一应用标识与存储配置 | [ADMIN-US-002](stories/platform/ADMIN-US-002-application-configuration.md) | 当前批次，保留默认数据标识 |
| 完整客户端国际化 | [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md)；共享运行时与中英文目录 | 三端六项 AC 本地通过，In Review；见 [国际化记录](plans/client-i18n-verification.md) |
| 新业务实体替换 | [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) | 待新业务闭环，不能用默认资产用例代替 |
| 自定义业务页面扩展 | [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) | Dashboard 三项 AC 三端本地通过，In Review；见 [扩展指南](plans/custom-pages-navigation.md) |
| Supabase 邮箱认证与会话恢复 | [ADMIN-US-201](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md)；当前模板仍未接入真实认证 | Backlog，未证明验证码、会话失效和身份替换 |
| 团队邀请、工作区和成员关系 | [ADMIN-US-202](stories/collaboration/ADMIN-US-202-team-membership-workspace.md) | Backlog，未证明多团队隔离和成员生命周期 |
| 团队权限与服务端隔离 | [ADMIN-US-203](stories/collaboration/ADMIN-US-203-permission-server-isolation.md) | Backlog，未证明 RLS、RPC、Realtime 和共享分支写入授权 |
| 本地上下文与显式导入 | [ADMIN-US-204](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) | Backlog，未证明匿名库、团队切换和导入预览 |
| 任务草稿与连续编辑 | [ADMIN-US-205](stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md) | Backlog，未证明整单任务、跨实体保存和共享数据不变 |
| 草稿同步与跨设备续作 | [ADMIN-US-206](stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md) | Backlog，未证明离线重试、双设备和会话恢复 |
| GitHub PR 式数据 PR | [ADMIN-US-207](stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md) | Backlog，未证明来源/目标分支、持续提交和 PR 状态机 |
| PR 讨论、字段评论与阻塞问题 | [ADMIN-US-208](stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md) | Backlog，未证明四页签、版本定位和必须处理规则 |
| 审核、批准与要求修改 | [ADMIN-US-209](stories/collaboration/ADMIN-US-209-review-approval.md) | Backlog，未证明批准绑定当前提交和权限分离 |
| 数据差异与合并前检查 | [ADMIN-US-210](stories/collaboration/ADMIN-US-210-diff-checks.md) | Backlog，未证明字段前后值、关联删除和版本过期重检 |
| 三方冲突与合并预览 | [ADMIN-US-211](stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md) | Backlog，未证明共同起点、字段选择和目标头变化 |
| 有权限合并与原子审计 | [ADMIN-US-212](stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) | Backlog，未证明服务端再校验、事务回滚和幂等合并 |
| 提交历史与恢复草稿 | [ADMIN-US-213](stories/collaboration/ADMIN-US-213-history-audit-restore.md) | Backlog，未证明合并审计、历史只读和恢复再审 |
| 评论通知与增强讨论 | [ADMIN-US-214](stories/collaboration/ADMIN-US-214-comment-notifications.md) | Backlog，后续优先级 |
| 在线成员与当前查看状态 | [ADMIN-US-215](stories/collaboration/ADMIN-US-215-presence.md) | Backlog，后续优先级 |
| 多级审批与可配置规则 | [ADMIN-US-216](stories/collaboration/ADMIN-US-216-multi-level-approval.md) | Backlog，后续优先级 |
| 独立仓库启动模板 | [长期目标](future-requirements.md) | 当前不实施、不声明已支持 |

当前不应把 `packages/rxdb-adapter-supabase`、`packages/rxdb-plugin-working-tree`、`packages/rxdb-plugin-sync` 或交互原型的存在写成 Admin 应用协作闭环已完成；它们只能作为对应故事的底层能力或设计参考。
