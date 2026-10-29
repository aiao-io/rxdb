# 状态概览

> **真相源**：`stories/*/MEDIA-US-*.md` 的 YAML `status`。本页按该字段派生，有冲突以 YAML 为准并修正本页。排期见[路线图](roadmap.md)，能力范围见[能力矩阵](capability-matrix.md)，证据分层见[验收记录](verification-report.md)。

当前范围是桌面浏览器上的本机图片创作：灵感与提示词、单张 PNG/JPEG 生成与交付、本机作品检索与按需预览、可选账号与跨设备同步、跨用户业务后台。账号、同步和后台只在真实本地 Supabase 上验证（[D-08](decisions.md)）。旧 Bun API/PostgreSQL、SSR/BFF、音视频、Electron 桌面与服务端任务/证据机不在范围内；后续方向见[未来功能需求](future-requirements.md)，不计入下表。

| 状态           |   数量 | 说明                                                                       |
| -------------- | -----: | -------------------------------------------------------------------------- |
| ✅ Done        |      8 | 工作区骨架，以及全部 AC 已验、按 [D-11](decisions.md) 在当前分支结项的七条 |
| 🚧 In Progress |      1 | 灵感库的真实桌面 IME 未验（[D-09](decisions.md)）                          |
| 👀 In Review   |      0 | 无                                                                         |
| ⬜ Backlog     |      1 | 移动真机验收暂缓（[D-04](decisions.md)）                                   |
| 🚫 Blocked     |      2 | 正式直连三画幅与真实跨 origin 原图 URL 缺少可用的真实供应商证据            |
| **合计**       | **12** | 不含模板和上游故事                                                         |

## 按 Epic 索引

### [工作区与静态发布](epics/MEDIA-EPIC-001.md)

- ✅ [MEDIA-US-001 多项目开发工作区](stories/platform/MEDIA-US-001-nx-workspace.md)
- ✅ [MEDIA-US-004 Cloudflare 边缘代理与安全部署](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md)

### [图片生成](epics/MEDIA-EPIC-002.md)

- 🚫 [MEDIA-US-105 图片供应商配置与适配器](stories/generation/MEDIA-US-105-provider-management.md)
- 🚫 [MEDIA-US-102 图片生成与本机交付](stories/generation/MEDIA-US-102-image-generation.md)
- 🚧 [MEDIA-US-106 图片提示词灵感库与一键套用](stories/generation/MEDIA-US-106-prompt-gallery.md)
- ⬜ [MEDIA-US-107 移动设备能力验收](stories/generation/MEDIA-US-107-mobile-verification.md)（暂缓）

### [账户、作品库与业务管理](epics/MEDIA-EPIC-003.md)

- ✅ [MEDIA-US-201 Supabase 账号与资源授权](stories/account/MEDIA-US-201-sessions.md)
- ✅ [MEDIA-US-202 本地图片作品与任务历史](stories/account/MEDIA-US-202-library.md)
- ✅ [MEDIA-US-203 跨用户业务后台管理](stories/account/MEDIA-US-203-business-admin.md)
- ✅ [MEDIA-US-204 本地作品检索与按需预览](stories/account/MEDIA-US-204-library-search.md)

### [本地优先与跨设备同步](epics/MEDIA-EPIC-004.md)

- ✅ [MEDIA-US-301 浏览器本地草稿与图片持久化](stories/local-first/MEDIA-US-301-browser-persistence.md)
- ✅ [MEDIA-US-302 多端草稿同步与冲突处理](stories/local-first/MEDIA-US-302-draft-sync.md)

## 未完成验收与关闭条件

12 条故事共 79 条 AC，73 条已通过，逐条见各 story 的验收标准表。实施清单均已完成：[本地交付](plans/local-delivery-tasks.md) 17/17、[作品检索](plans/library-search-tasks.md) 10/10、[分支收尾](plans/branch-completion-20261029.md)。剩余 6 条只缺真实环境证据：

| 故事 / AC                                                                  | 当前进展                                                                                                                                                                                  | 关闭所需证据                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MEDIA-US-102 AC7](stories/generation/MEDIA-US-102-image-generation.md)    | 正式 origin 代理三画幅已验。直连只有两条未知记录：原供应商正方形无响应（预检 403）；MiniMax 正方形业务成功但浏览器未读到原图，结果 URL 已过 24 小时有效期、无法回查。横向、纵向直连待诊断 | 直连三画幅各一次真实原图的保存、刷新回读与精确下载。正方形须用户先在 MiniMax 控制台核对 2026-10-25 22:04 那笔请求再明确解锁；若原图跨域不可读，须先决定直连是否改用 base64（会改动本故事范围） |
| [MEDIA-US-105 AC7](stories/generation/MEDIA-US-105-provider-management.md) | 产品内成功结果均为 base64；MiniMax 图片域名能否被浏览器跨域读取，待直连横图诊断确认                                                                                                       | 真实跨 origin HTTPS 原图经实际适配器读取、保存与精确下载，请求不带 Authorization、Cookie 或 Referer；base64 与 fixture 不能替代                                                                |
| [MEDIA-US-106 AC7](stories/generation/MEDIA-US-106-prompt-gallery.md)      | 真实系统输入法验收入口 `aiao-media-e2e:desktop-ime-acceptance` 已就绪、尚未实跑；本轮按 D-09 跳过                                                                                         | 在真实系统中文输入法上完成正文/字段输入、粘贴、撤销重做，且不丢字、不抢焦点、无布局溢出                                                                                                        |
| [MEDIA-US-107 AC1](stories/generation/MEDIA-US-107-mobile-verification.md) | 按 D-04 暂缓                                                                                                                                                                              | 在选定设备与系统 IME 上验证输入、参数一致性与不重复生成                                                                                                                                        |
| [MEDIA-US-107 AC2](stories/generation/MEDIA-US-107-mobile-verification.md) | 按 D-04 暂缓                                                                                                                                                                              | 在支持所需存储的设备上验证保存、重开、离线预览和实际文件下载                                                                                                                                   |
| [MEDIA-US-107 AC3](stories/generation/MEDIA-US-107-mobile-verification.md) | 按 D-04 暂缓                                                                                                                                                                              | 实测系统拒绝或限制，不虚报保存/下载，重试保留已有数据和原结果                                                                                                                                  |

## 合并状态

PR [#154](https://github.com/aiao-io/rxdb/pull/154) 为 OPEN/DRAFT、未合并；合并前须最新 head 的远程 CI 全绿（`gh pr checks 154`）。七条 Done 按 D-11 在当前分支结项，评审与合并单独跟踪。

## 范围说明

- MEDIA-US-001 的 ✅ 只覆盖 Nx 工作区骨架。
- MEDIA-US-004：正式域名、四路由/WASM/CSP/旧 API 404、完整离线内容与官方 A→B→A 更新/回退已验，见[正式交付验收](plans/public-delivery-verification.md)；线上当前版本见[验收记录](verification-report.md#正式环境证据)。
- MEDIA-US-201/203/302：账号会话、工作区绑定、产品 RLS、原生复制、冲突/删除、后台与显式上报均为真实本地验证；D-06 不设 TTL/自动清理，生产启用属后续范围。
- MEDIA-US-204：本地分层验收（1,005 条 metadata 原生压力、50 张图片全应用 IO），不是 1,000 张原图的 UI 实测，见[实施清单](plans/library-search-tasks.md)。
