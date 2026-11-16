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
