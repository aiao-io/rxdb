# 状态概览

> **真相源**：`stories/*/MEDIA-US-*.md` 的 YAML `status`。本页按该字段派生，有冲突以 YAML 为准并修正本页。排期见[路线图](roadmap.md)，能力范围见[能力矩阵](capability-matrix.md)，证据分层见[验收记录](verification-report.md)。

当前范围是桌面浏览器上的图片创作：灵感与提示词、平台积分生图与本机交付、本机作品检索与按需预览、可选账号与跨设备同步、跨用户业务后台。按 [D-19](decisions.md#d-19登录用户经平台积分生图移除用户自配供应商)，用户不再配置供应商：模型与凭据由平台统一托管，登录平台账号且积分可用即可生成，未登录保留本机草稿、灵感浏览与本机作品。海外平台账号与同步已按 [D-16](decisions.md) 正式启用，国内自建 Supabase 与 IP HTTPS 已通过[发布验收](plans/self-hosted-release-20261109.md)；公众邮件与桌面联验仍待完成。旧 Bun API/PostgreSQL、SSR/BFF、音视频、Electron 桌面与通用供应商证据机不在范围内；充值计费按 [D-17](decisions.md#d-17充值退款与价格体系暂缓平台生图已按-d-19-恢复为积分制) 暂缓，积分由后台发放（MEDIA-US-206）。原自有项目接入需求与代码按用户决定移除。本站服务端任务与刷新续接拆为 MEDIA-US-109，已实现并通过本地测试，上游 Key 改由平台凭据后待真实账号验证与正式发布，范围决策见 [D-15](decisions.md#d-15本站代理生图改为服务端任务) 与 [D-19](decisions.md#d-19登录用户经平台积分生图移除用户自配供应商)。

| 状态           |   数量 | 说明                                                                |
| -------------- | -----: | ------------------------------------------------------------------- |
| ✅ Done        |      8 | 工作区骨架，以及全部 AC 已验、按 [D-11](decisions.md) 结项的七条    |
| 🚧 In Progress |      7 | 灵感库 IME 未验、桌面、同步，以及 D-19 的平台积分生图与后台积分管理 |
| 👀 In Review   |      3 | 本机交付、国内自建部署与首次安装流程，等待评审与合入                |
| ⬜ Backlog     |      2 | 移动真机按 D-04、平台支付按 D-17 暂缓                               |
| 🚫 Blocked     |      0 | —                                                                   |
| **合计**       | **20** | 不含模板和上游故事                                                  |

## 按 Epic 索引

### [工作区与静态发布](epics/MEDIA-EPIC-001.md)

- ✅ [MEDIA-US-001 多项目开发工作区](stories/platform/MEDIA-US-001-nx-workspace.md)
- ✅ [MEDIA-US-004 Cloudflare 静态部署与平台生成入口](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md)
- 🚧 [MEDIA-US-005 Tauri 本地安装版](stories/platform/MEDIA-US-005-tauri-desktop.md)
- 👀 [MEDIA-US-006 国内自建服务与 IP HTTPS 部署](stories/platform/MEDIA-US-006-self-hosted-deployment.md)
- 👀 [MEDIA-US-007 首次访问后台初始化](stories/platform/MEDIA-US-007-installation.md)

### [图片生成](epics/MEDIA-EPIC-002.md)

- 🚧 [MEDIA-US-108 平台积分生图与额度](stories/generation/MEDIA-US-108-platform-generation.md)
- 🚧 [MEDIA-US-109 平台生图服务端任务与刷新续接](stories/generation/MEDIA-US-109-relay-durable-task.md)
- 👀 [MEDIA-US-102 图片生成与本机交付](stories/generation/MEDIA-US-102-image-generation.md)
- 🚧 [MEDIA-US-106 图片提示词灵感库与一键套用](stories/generation/MEDIA-US-106-prompt-gallery.md)
- ⬜ [MEDIA-US-107 移动设备能力验收](stories/generation/MEDIA-US-107-mobile-verification.md)（暂缓）

### [账户、作品库与业务管理](epics/MEDIA-EPIC-003.md)

- ✅ [MEDIA-US-201 Supabase 账号与资源授权](stories/account/MEDIA-US-201-sessions.md)
- ✅ [MEDIA-US-202 本地图片作品与任务历史](stories/account/MEDIA-US-202-library.md)
- ✅ [MEDIA-US-203 跨用户业务后台管理](stories/account/MEDIA-US-203-business-admin.md)
- ✅ [MEDIA-US-204 本地作品检索与按需预览](stories/account/MEDIA-US-204-library-search.md)
- 🚧 [MEDIA-US-206 后台积分管理](stories/account/MEDIA-US-206-credit-admin.md)
- ⬜ [MEDIA-US-205 平台支付、退款与生产运维](stories/account/MEDIA-US-205-platform-billing.md)（D-17 暂缓）

### [本地优先与跨设备同步](epics/MEDIA-EPIC-004.md)

- ✅ [MEDIA-US-301 浏览器本地草稿与图片持久化](stories/local-first/MEDIA-US-301-browser-persistence.md)
- ✅ [MEDIA-US-302 多端草稿同步与冲突处理](stories/local-first/MEDIA-US-302-draft-sync.md)
- 🚧 [MEDIA-US-303 平台账号与同步管理](stories/local-first/MEDIA-US-303-sync-targets.md)
- 🚧 [MEDIA-US-305 图片原文件同步到平台 Supabase](stories/local-first/MEDIA-US-305-supabase-image-sync.md)

## 未完成验收与关闭条件

20 条故事共 140 条 AC，89 条已通过（✅）、15 条部分通过（⚠️）、36 条待验（⬜）；MEDIA-US-205 随 D-17 暂缓，MEDIA-US-108/206 按 D-19 重新纳入范围、全部 AC 待验。既有实施清单已完成：[本地交付](plans/local-delivery-tasks.md) 17/17、[作品检索](plans/library-search-tasks.md) 10/10、[分支收尾](plans/branch-completion-20261029.md)。既有范围剩余 4 条只缺真实环境证据；MEDIA-US-109 的 12 条 AC 中 5 条已有本地证据，其余等平台凭据改造、真实账号验证、R2 生命周期配置与正式发布，分阶段关闭条件见[实施计划](plans/relay-durable-tasks.md)。MEDIA-US-305 的 14 条 AC 按统一平台目标继续验收；正式云 Web 侧原图上传与显式下载的字节一致性已验，关闭条件为 Tauri 跨设备、大图续传与删除冲突联验。撤销的自有项目接入需求不再计入当前故事或 AC。用户自配供应商、直连与按请求 Key 代理随 D-19 出范围。这些不计入下表既有缺证项：

| 故事 / AC                                                                  | 当前进展                                                                                          | 关闭所需证据                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [MEDIA-US-106 AC7](stories/generation/MEDIA-US-106-prompt-gallery.md)      | 真实系统输入法验收入口 `aiao-media-e2e:desktop-ime-acceptance` 已就绪、尚未实跑；本轮按 D-09 跳过 | 在真实系统中文输入法上完成正文/字段输入、粘贴、撤销重做，且不丢字、不抢焦点、无布局溢出               |
| [MEDIA-US-107 AC1](stories/generation/MEDIA-US-107-mobile-verification.md) | 按 D-04 暂缓                                                                                      | 在选定设备与系统 IME 上验证输入、参数一致性与不重复生成                                               |
| [MEDIA-US-107 AC2](stories/generation/MEDIA-US-107-mobile-verification.md) | 按 D-04 暂缓                                                                                      | 在支持所需存储的设备上验证保存、重开、离线预览和实际文件下载                                          |
| [MEDIA-US-107 AC3](stories/generation/MEDIA-US-107-mobile-verification.md) | 按 D-04 暂缓                                                                                      | 实测系统拒绝或限制，不虚报保存/下载，重试保留已有数据和原结果                                         |
| [MEDIA-US-108 AC6](stories/generation/MEDIA-US-108-platform-generation.md) | 需求已按 D-19 重新设计，实现与验收尚未开始                                                        | 正式域名真实平台账号+积分三画幅各一次：只调用一次上游，结果保存/回读/精确下载一致，积分扣减与流水一致 |
| [MEDIA-US-108 AC7](stories/generation/MEDIA-US-108-platform-generation.md) | 同上                                                                                              | 国内自建部署使用同一积分契约：后台发放可见、生成扣减一致、本机交付正常                                |

## 合并状态

PR [#154](https://github.com/aiao-io/rxdb/pull/154) 为 OPEN/DRAFT、未合并；2026-11-11 已同步 main 并修复评审问题，当前与 main 仍有冲突（`gh pr view 154 --json mergeable` 为 CONFLICTING），须先重新同步 main，并在最新 head 的远程 CI 全绿（`gh pr checks 154`）后评审合并。七条 Done 按 D-11 在当前分支结项，评审与合并单独跟踪。

## 范围说明

- MEDIA-US-001 的 ✅ 只覆盖 Nx 工作区骨架。
- MEDIA-US-004：正式域名、四路由/WASM/CSP/旧 API 404、完整离线内容与官方 A→B→A 更新/回退已验，见[正式交付验收](plans/public-delivery-verification.md)；线上当前版本见[验收记录](verification-report.md#正式环境证据)。按请求 Key 的无状态代理由平台任务接口取代（D-19）。
- MEDIA-US-201/203/302：账号会话、工作区绑定、产品 RLS、原生复制、冲突/删除、后台与显式上报均为真实本地验证；D-06 不设 TTL/自动清理。平台账号与同步已按 D-16 正式启用（Web），生产管理后台与公众注册邮件仍待验收，见[平台发布记录](plans/platform-supabase-release-20261106.md)。供应商策略管理随 D-19 移除。
- MEDIA-US-204：本地分层验收（1,005 条 metadata 原生压力、50 张图片全应用 IO），不是 1,000 张原图的 UI 实测，见[实施清单](plans/library-search-tasks.md)。
