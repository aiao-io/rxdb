# Admin 产品路线图

当前在本仓库孵化 Angular / React / Vue 三端模板，未来独立导出暂不进入实施批次。状态见 [status-overview](status-overview.md)，不在本页维护第二份状态。

## 协作首版：等待真实邮件环境证据

以下故事按 [协作首版共享契约](collaboration-contract.md) 定义产品行为、并发、权限和验收条件，实现在 `packages/collaboration`，AC 已在本地隔离栈通过，只有 ADMIN-US-201 的 #2 / #3 除外：它们还差生产 SMTP 投递与验证码自然到期两项真实邮件环境证据，由 ADMIN-US-217 的部署提供。ADMIN-US-202～216 硬依赖 ADMIN-US-201，随它一起关闭。现有插件不替代应用闭环证据。

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
- [ADMIN-US-210](stories/collaboration/ADMIN-US-210-diff-checks.md) 数据差异展示与合并前检查
- [ADMIN-US-211](stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md) 三方冲突检测与最终候选生成
- [ADMIN-US-209](stories/collaboration/ADMIN-US-209-review-approval.md) 候选审核、批准与要求修改聚合
- [ADMIN-US-212](stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) 有权限合并与原子提交
- [ADMIN-US-213](stories/collaboration/ADMIN-US-213-history-audit-restore.md) 提交历史、合并审计与版本恢复草稿

### 后续增强

- [ADMIN-US-214](stories/collaboration/ADMIN-US-214-comment-notifications.md) 评论通知与增强讨论协作
- [ADMIN-US-215](stories/collaboration/ADMIN-US-215-presence.md) 在线成员与当前查看状态
- [ADMIN-US-216](stories/collaboration/ADMIN-US-216-multi-level-approval.md) 多级审批与可配置合并规则

## 协作后端收敛与上线

方向见 [D-09](decisions.md#d-09协作后端收敛方向)，切片、平台缺口与预算见 [协作后端收敛实施计划](plans/collaboration-convergence-tasks.md)，统一归属 [ADMIN-EPIC-004](epics/ADMIN-EPIC-004.md)。差量提交、Supabase 原生读取与实时、团队任务草稿落在工作树（ADMIN-US-218 / 219 / 221）已交付，平台前置 US-319、US-320 同样已交付。剩余两条：

1. [ADMIN-US-220](stories/collaboration/ADMIN-US-220-supabase-only-deployment.md) 命令入口改为 Edge Function，只部署 Supabase：还差在全新的真实 Supabase 项目上部署并跑三端（AC#1）。
2. [ADMIN-US-217](stories/collaboration/ADMIN-US-217-production-deployment-operations.md) staging / production 部署、真实邮箱证据、部署后三端协作验收与运维护栏；它同时提供 ADMIN-US-201 与 ADMIN-US-220 所缺的真实环境证据。

## Supabase 接入标准化

方向见 [D-11](decisions.md#d-11supabase-接入走平台标准层)，评估、对照与本次合并的影响见 [Supabase 接入标准化计划](plans/supabase-standardization-tasks.md)，统一归属 [ADMIN-EPIC-005](epics/ADMIN-EPIC-005.md)。结论：会话、身份、按身份分库与授权快照走平台标准（`rxdb-adapter-supabase` 与 RxDB 核心），Admin 是这些能力的第一个三端业务验收；团队共享数据仍仅经 PR 合并，不改用日志同步与直写。

0. 先修合并回归：合并 `origin/main`（#226）之后，三端 Dashboard「最近活动」e2e 各有 1 条失败，根因是平台 US-318 的删除判据比故事范围宽；修法待 owner 选，推荐收窄平台判据（计划第 3 节）。
1. [ADMIN-US-222](stories/collaboration/ADMIN-US-222-identity-bound-local-databases.md) 本机库按账号隔离：平台前置 US-035 已交付，可以开工；旧的设备共用库怎么处理先由 owner 定。建议在 ADMIN-US-217 正式上线前完成，免得给真实设备写迁移。
2. [ADMIN-US-223](stories/collaboration/ADMIN-US-223-platform-supabase-session.md) 全局会话改用平台会话层：等平台 US-237（根 roadmap 批次 13）。
3. [ADMIN-US-224](stories/collaboration/ADMIN-US-224-team-database-standard-grants.md) 团队库接入标准适配器、按权限显隐：等平台 US-039 与 US-238（根 roadmap 批次 13）。

协作服务端迁到平台的仅经 PR 能力登记在平台 epic-017（US-321 / US-322 / US-239，价值待证），平台交付之前协作包保持现状。ADMIN-US-217 / 220 的部署证据可以并行推进；部署后的三端协作验收建议排在 ADMIN-US-223 之后跑一次，免得重跑。

## 既有前置

[ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) 等待一组真实的新业务关联实体、字段、关系与非 `assets` 命名空间；确定后验证新业务 CRUD、关联筛选、搜索、Dashboard、刷新重开和备份恢复，同时保留默认资产回归。Dashboard 已验证非 CRUD 页面路径，自定义页面不再依赖另找实例。

[优化清单 T04 / T05](plans/nexus-template-optimization-tasks.md) 已完成本地验证：大日志量查询的预算与九组前后结果见 [性能记录](plans/dashboard-performance-verification.md)，首屏体积及仍存第三方告警见 [构建记录](plans/bundle-size-verification.md)。复验入口已区分旧基线与当前布局；更大规模预算或第三方告警消除需要另行确认范围。

## 长期目标

独立仓库启动模板、OAuth/企业 SSO、桌面宿主和跨产品通知见 [future-requirements](future-requirements.md)，需在协作首版闭环完成并具备具体使用场景后另行立项。
