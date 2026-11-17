# Admin 产品路线图

当前在本仓库孵化 Angular / React / Vue 三端模板，未来独立导出暂不进入实施批次。状态见 [status-overview](status-overview.md)，不在本页维护第二份状态。

## 产品需求管理升级

[ADMIN-US-004](stories/platform/ADMIN-US-004-product-requirements.md) 已将三端及对应 E2E 源码归入产品 `apps/`，产品 `requirements/` 统一需求，共用 Nx 门禁并覆盖 affected 依赖，本地验收通过、待评审合并；验收记录见 [迁移验证](plans/product-requirements-verification.md)。

## 当前评审批次

| 故事                                                                              | 本地验收与合入条件                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md) 完整客户端国际化     | 三端六项 AC 本地通过；见 [国际化证据](plans/client-i18n-verification.md)，待统一评审与合并                                                       |
| [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) 自定义页面 | Dashboard、桌面／移动导航、深链刷新、页签、面包屑、命令面板与偏好扩展本地通过；见 [扩展指南](plans/custom-pages-navigation.md)，待统一评审与合并 |

公共元数据呈现能力与应用接线在同一变更内评审、验证。Done 仍以合并并补齐同层验收证据为准。

## 协作闭环本地实现，待评审与部署

以下故事按 [协作首版共享契约](collaboration-contract.md) 定义产品行为、并发、权限和验收条件，当前故事均为 In Review。可信初始化、会话矩阵、任务提交图同步、PR、讨论、审核、原子合并、审计和基础通知/Presence/多阶段规则已落地到 `packages/collaboration`；待统一评审、正式部署和逐条 AC 证据补齐。现有插件不替代应用闭环证据。

### 第一阶段：身份、团队与任务草稿（In Review）

- [ADMIN-US-201](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md) Supabase 邮箱验证码登录与会话恢复
- [ADMIN-US-202](stories/collaboration/ADMIN-US-202-team-membership-workspace.md) 团队邀请、成员与工作区选择
- [ADMIN-US-203](stories/collaboration/ADMIN-US-203-permission-server-isolation.md) 团队操作权限与服务端隔离
- [ADMIN-US-204](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) 本地数据上下文隔离与显式导入
- [ADMIN-US-205](stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md) 任务草稿与连续编辑
- [ADMIN-US-206](stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md) 草稿云同步、跨设备续作与离线恢复

### 第二阶段：数据 PR、审核与合并（In Review）

- [ADMIN-US-207](stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md) 数据变更 PR 创建与生命周期
- [ADMIN-US-208](stories/collaboration/ADMIN-US-208-data-pr-discussion-comments.md) 数据 PR 讨论、评论与变更定位
- [ADMIN-US-210](stories/collaboration/ADMIN-US-210-diff-checks.md) 数据差异展示与合并前检查
- [ADMIN-US-211](stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md) 三方冲突检测与最终候选生成
- [ADMIN-US-209](stories/collaboration/ADMIN-US-209-review-approval.md) 候选审核、批准与要求修改聚合
- [ADMIN-US-212](stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) 有权限合并与原子提交
- [ADMIN-US-213](stories/collaboration/ADMIN-US-213-history-audit-restore.md) 提交历史、合并审计与版本恢复草稿

### 后续增强（In Review，独立浏览器证据待补）

- [ADMIN-US-214](stories/collaboration/ADMIN-US-214-comment-notifications.md) 评论通知与增强讨论协作
- [ADMIN-US-215](stories/collaboration/ADMIN-US-215-presence.md) 在线成员与当前查看状态
- [ADMIN-US-216](stories/collaboration/ADMIN-US-216-multi-level-approval.md) 多级审批与可配置合并规则

## 下一批：协作后端收敛与上线（Backlog）

方向见 [D-09](decisions.md#d-09协作后端收敛方向)，切片、平台缺口与预算见 [协作后端收敛实施计划](plans/collaboration-convergence-tasks.md)，统一归属 [ADMIN-EPIC-004](epics/ADMIN-EPIC-004.md)。以上协作故事的用户可见行为不变，保持 In Review；收敛完成后在新实现上整体回归，再统一评审合并。

1. 阶段 0，基线度量：记录现状下命令耗时、快照体积、WAL 与锁等待随提交数增长的曲线，作为对照组。
2. [ADMIN-US-218](stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md) 差量提交与有界命令成本：ChangeSet 提交（对齐平台 working-tree）、拆表、引用 CAS、细粒度锁、元数据驱动校验。
3. [ADMIN-US-219](stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md) RLS 分页读取、Realtime Broadcast 与 Presence、本地 JWT 校验。
4. [ADMIN-US-220](stories/collaboration/ADMIN-US-220-supabase-only-deployment.md) 命令入口改为 Edge Function，只部署 Supabase。
5. [ADMIN-US-217](stories/collaboration/ADMIN-US-217-production-deployment-operations.md) staging / production 部署、真实邮箱证据、部署后三端协作验收与运维护栏。
6. [ADMIN-US-221](stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md) 团队任务草稿落在 RxDB 工作树：不阻塞上线，等待平台立项。

并行事项：在根 requirements 为 working-tree 的「导入远端提交并保留身份」「多父提交」「回写业务表的 discard / restore」立项。这三项目前是平台 epic-006 的非目标，需要先决策。

## 既有前置

[ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) 等待一组真实的新业务关联实体、字段、关系与非 `assets` 命名空间；确定后验证新业务 CRUD、关联筛选、搜索、Dashboard、刷新重开和备份恢复，同时保留默认资产回归。Dashboard 已验证非 CRUD 页面路径，自定义页面不再依赖另找实例。

[优化清单 T04 / T05](plans/nexus-template-optimization-tasks.md) 已完成本地验证：大日志量查询的预算与九组前后结果见 [性能记录](plans/dashboard-performance-verification.md)，首屏体积及仍存第三方告警见 [构建记录](plans/bundle-size-verification.md)。复验入口已区分旧基线与当前布局；更大规模预算或第三方告警消除需要另行确认范围。

## 长期目标

独立仓库启动模板、OAuth/企业 SSO、桌面宿主和跨产品通知见 [future-requirements](future-requirements.md)，需在协作首版闭环完成并具备具体使用场景后另行立项。
