# 状态概览

> 当前范围是首发验收中的 local-first 图片应用、已实现的可选账号会话、待接线的 Supabase 同步和已纳入计划的跨用户业务后台。旧的 Bun API/PostgreSQL、SSR/BFF、音视频、桌面与服务端任务/证据机不在当前范围；当前 11 条故事包含桌面图片、同步、业务后台和暂缓的移动设备验收。

> **真相源**：`stories/*/US-*.md` 的 YAML `status`。本页按该字段派生；有冲突先修正本页，不靠此页覆盖 story。范围和排期见 [路线图](roadmap.md)，能力真值见 [能力矩阵](capability-matrix.md)。

| 状态           |   数量 | 说明                                                       |
| -------------- | -----: | ---------------------------------------------------------- |
| ✅ Done        |      1 | 多项目开发工作区                                           |
| 🚧 In Progress |      8 | 静态部署、图片生成/供应商/灵感库、会话、作品库、本地与同步 |
| 👀 In Review   |      0 | 无                                                         |
| ⬜ Backlog     |      2 | 跨用户业务后台、暂缓的移动设备验收                         |
| 🚫 Blocked     |      0 | 无                                                         |
| **合计**       | **11** | 不含模板和上游故事                                         |

## 按 Epic 索引

### [工作区与静态发布](epics/MEDIA-EPIC-001.md)

- ✅ [MEDIA-US-001 多项目开发工作区](stories/platform/MEDIA-US-001-nx-workspace.md)
- 🚧 [MEDIA-US-004 Cloudflare 边缘代理与安全部署](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md)

### [图片生成](epics/MEDIA-EPIC-002.md)

- 🚧 [MEDIA-US-105 图片供应商配置与适配器](stories/generation/MEDIA-US-105-provider-management.md)
- 🚧 [MEDIA-US-102 图片生成与本机交付](stories/generation/MEDIA-US-102-image-generation.md)
- 🚧 [MEDIA-US-106 图片提示词灵感库与一键套用](stories/generation/MEDIA-US-106-prompt-gallery.md)
- ⬜ [MEDIA-US-107 移动设备能力验收](stories/generation/MEDIA-US-107-mobile-verification.md)（暂缓）

### [账户、作品库与业务管理](epics/MEDIA-EPIC-003.md)

- 🚧 [MEDIA-US-201 Supabase 账号与资源授权](stories/account/MEDIA-US-201-sessions.md)
- 🚧 [MEDIA-US-202 本地图片作品与任务历史](stories/account/MEDIA-US-202-library.md)
- ⬜ [MEDIA-US-203 跨用户业务后台管理](stories/account/MEDIA-US-203-business-admin.md)

### [本地优先与跨设备同步](epics/MEDIA-EPIC-004.md)

- 🚧 [MEDIA-US-301 浏览器本地草稿与图片持久化](stories/local-first/MEDIA-US-301-browser-persistence.md)
- 🚧 [MEDIA-US-302 多端草稿同步与冲突处理](stories/local-first/MEDIA-US-302-draft-sync.md)

## 解释

MEDIA-US-001 的 ✅ 只覆盖 Nx 工作区骨架。MEDIA-US-004 有 Workers 静态产物与公网烟测记录；正式自定义域名、供应商正式 origin 与部署回退仍待验。

MEDIA-US-105/102/106 已实现本机供应商管理、直连/代理、任务日志、Tiptap 灵感库及 PNG 保存/回读。MEDIA-US-301/202 使用真实 RxDB + wa-sqlite/IndexedDB 与 OPFS；本机刷新、离线、备份中断续导、草稿冲突选择、保存/删除中断恢复、凭据生命周期与模板撤销边界已验。正式供应商、历史迁移/正式回退与桌面真实 IME AC 仍有保留；移动真机已暂缓，不阻断当前工作。

MEDIA-US-201 的账号会话已有实现与真实本地 Auth 验证，工作区绑定、产品 RLS 和首次同步确认待实施。MEDIA-US-302 的产品复制尚未接线；上游已有 adapter 与同步设施，需验证兼容版本、数据契约及本仓集成。当前测试数量与逐层边界统一见[验收记录](verification-report.md)。

MEDIA-US-203 的用户、模板、供应商策略、任务和用量范围已确定，仍未实现。账号绑定方案见[计划](plans/account-workspace-binding.md)，后台阶段见[后台计划](plans/business-admin.md)。D-06 冲突期限在真实场景再决策，不阻断最小接线。
