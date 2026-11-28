# Admin 产品后续方向

## 当前孵化

先在本仓库形成可维护的应用模板基线，再通过一组新业务实体与一个非 CRUD 页面检验实际扩展成本。对应 [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) / [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md)，不先设计额外插件系统。

认证和数据协作已经完成产品需求拆分，并已在产品私有包完成首版本地实现；故事保持 In Review，尚未视为合入或生产可用：

- [ADMIN-EPIC-002](epics/ADMIN-EPIC-002.md) 负责 Supabase 邮箱认证、团队工作区、权限隔离、任务草稿和跨设备同步。
- [ADMIN-EPIC-003](epics/ADMIN-EPIC-003.md) 负责 GitHub PR 式数据变更中心、讨论、审核、冲突、合并和审计。

ADMIN-EPIC-002 与 ADMIN-EPIC-003 当前为 In Progress，其故事为 In Review；正式部署和逐条 AC 评审仍未完成。现有 Supabase 适配器、working tree、sync、历史和分支比较能力不能替代团队授权、PR 生命周期或服务端原子合并验收。

## 协作首版边界

首版闭环按以下顺序规划：可信初始化首个团队 → 邮箱验证码登录与邀请 → 选择团队 → 权限隔离 → 显式接入本地数据 → 任务草稿 → 提交及同步 → 数据 PR → 讨论和字段定位 → 差异检查 → 三方冲突处理及最终候选 → 候选审核 → 有权限原子合并 → 审计与恢复草稿。

首版保留本地保存，不因登录自动上传旧库；保存、同步和合并是三个不同动作。共享分支的数据变化只有在服务端原子合并后才对团队共享，普通客户端不能直写。离线、邀请、双设备分叉、候选和多人审核的共同规则见 [共享契约](collaboration-contract.md)。

## 后续候选

- OAuth、企业 SSO 和更复杂的账号恢复：在邮箱验证码首版稳定且有明确身份提供方需求后，另建故事和验收环境。
- [ADMIN-US-214](stories/collaboration/ADMIN-US-214-comment-notifications.md) 评论通知与增强讨论：基础字段级评论闭环完成后排期。
- [ADMIN-US-215](stories/collaboration/ADMIN-US-215-presence.md) 在线成员与当前查看状态：基础 PR 协作完成后按实时协作需求排期。
- [ADMIN-US-216](stories/collaboration/ADMIN-US-216-multi-level-approval.md) 多级审批与可配置合并规则：单级审批/免审批策略完成后按治理复杂度排期。
- 独立仓库启动模板：应用基线、真实业务扩展和协作闭环稳定且确有独立项目需要时，再评审工程边界、依赖与独立验收。
- 桌面宿主、跨产品通知和合规审计导出：需要具体宿主和合规场景后另行立项。

### 2026-11-17 缺口分析登记的候选

以下来自 2026-11-17 用户故事缺口分析，尚未立项，均不参与当前故事关闭；立项时按 [CONVENTIONS](CONVENTIONS.md) 分配编号。部署与运维闭环已建为 [ADMIN-US-217](stories/collaboration/ADMIN-US-217-production-deployment-operations.md)。

Admin 模板通用能力：

- 自助创建团队：登录用户在配额内创建团队并成为管理员，服务端有频率限制与邮箱验证；[ADMIN-US-202](stories/collaboration/ADMIN-US-202-team-membership-workspace.md) 首版明确不含。
- 账号与个人设置：设备会话列表与远程注销、修改邮箱后的邀请匹配规则、注销账号时团队数据的移交或锁定。
- CSV 导入导出：按当前筛选导出；导入进入任务草稿，复用 [ADMIN-US-204](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) 的预览与不直写共享数据语义，并给出字段映射和错误报告。
- 批量操作与回收站：多选批量编辑或删除进入当前任务草稿，删除默认可在期限内恢复，恢复与清理同样经过 PR 审核。
- 通知中心：全局入口与未读计数，按团队、PR、提及筛选与批量已读；[ADMIN-US-214](stories/collaboration/ADMIN-US-214-comment-notifications.md) 已有通知数据与跳转。
- 无障碍产品门禁：三端共享 a11y 套件覆盖外壳、实体页与协作页（PR 四页签、评论、审批）。
- 性能预算持续门禁：首屏体积与 Dashboard 查询预算进入 CI，协作 PR 列表与差异页纳入预算；T04 / T05 目前只是一次性验证。

协作深度（各故事 Out of Scope 中的高价值项）：

- 记录级部分提交与多 PR 拆分（[ADMIN-US-205](stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md)、[ADMIN-US-207](stories/collaboration/ADMIN-US-207-data-pr-lifecycle.md)）。
- 字段级权限与数据脱敏，与六类操作权限正交（[ADMIN-US-203](stories/collaboration/ADMIN-US-203-permission-server-isolation.md)）。
- 审核人自动分配与审批代理，与多级审批衔接（[ADMIN-US-209](stories/collaboration/ADMIN-US-209-review-approval.md)、[ADMIN-US-216](stories/collaboration/ADMIN-US-216-multi-level-approval.md)）。
- 共享版本列表、任意两版本差异与时间线视图（[ADMIN-US-213](stories/collaboration/ADMIN-US-213-history-audit-restore.md)）。

增强与扩展（依赖真实场景或首版闭环稳定）：Webhook 与外部集成（带签名校验）、PR / 记录 / 通知的深链分享、统计口径确认后的报表与图表、富文本评论与附件、组织层级与跨团队共享、移动端完整验收（表单、协作页、离线）。

### 平台能力候选（来自协作后端收敛）

[ADMIN-US-221](stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md) 需要的平台能力已于 2026-11-17 在根 requirements 以 [epic-014](../../requirements/epics/epic-014-commit-graph-remote-exchange.md) 立项，不再是候选：导入远端提交与多父提交见 [US-319](../../requirements/stories/collaboration/US-319-remote-commit-import.md)，`discard()` / `restore()` 回写业务表见 [US-320](../../requirements/stories/collaboration/US-320-discard-restore-projection.md)。仍留作候选的只有：

- 三方字段级合并与「停在合并状态由用户裁决」：目前只有产品服务端的 `mergeRecords` 实现；平台需要时再上移，不作为 ADMIN-US-221 的前置（2026-11-28 已登记为平台 US-322，见下节）。

### 平台能力候选（来自 Supabase 接入标准化）

2026-11-28 owner 定方向（[D-11](decisions.md#d-11supabase-接入走平台标准层)）：连 Supabase 走平台标准逻辑。连接层的平台缺口已立项，由 [ADMIN-EPIC-005](epics/ADMIN-EPIC-005.md) 消费（平台 US-237 会话层、US-039 整库一个作用域、US-238 只接身份与授权）。Admin 独有、日志同步给不了的部分在根 requirements 登记为 [epic-017](../../requirements/epics/epic-017-pr-only-team-data.md)，价值待证：

- [US-321](../../requirements/stories/collaboration/US-321-supabase-commit-exchange.md) Supabase 上的提交图远端交换；
- [US-322](../../requirements/stories/collaboration/US-322-pr-only-write-mode.md) 仅经 PR 写入；
- [US-239](../../requirements/stories/adapter/US-239-supabase-team-membership-realtime.md) 团队成员、邀请与协作实时。

平台交付并解锁之后，另立 Admin 故事把协作服务端迁上去；在那之前协作包保持现状。

### 2026-11-17 代码评审登记的工程收敛

- 三端领域模块下沉产品私有包：`dashboard-model`、`dashboard-activity-query`、`dashboard-activity-source`、`record-search`、`backup-ops`、`entity-labels`、`entity-registry`、`asset-entities`、`workbench-activity-index` 与 `i18n/` 目录在三端逐字节相同，同一修复要改三份。`entity-registry` 与 `workbench-i18n` 读取各端的 `app.config.json`，下沉前需先设计配置注入，并评估对独立仓库启动模板导出的影响。
- E2E 表格工具的稳定测试出口：三端共享的 `apps/react-e2e/src/e2e-utils.ts` 读取 VTable 私有内部（`__vtable__`、scenegraph、内部 records），需由 `rxdb-model` 三端绑定提供公开、对称的测试出口后替换，表格实现重构才不会连带打碎 E2E。
