# 状态概览

> 本地作品检索、24 件稳定分页与真实视口按需预览已完成本地验收，按 D-11 在当前分支结项，PR 待评审合并；既有图片交付、账号、同步和后台保留原验收范围。旧 Bun API/PostgreSQL、SSR/BFF、音视频、桌面与服务端任务/证据机不在当前范围；当前 12 条故事包含桌面图片、作品检索、同步、后台和暂缓的移动设备验收。

> **真相源**：`stories/*/MEDIA-US-*.md` 的 YAML `status`。本页按该字段派生；有冲突先修正本页，不靠此页覆盖 story。范围和排期见 [路线图](roadmap.md)，能力真值见 [能力矩阵](capability-matrix.md)。

| 状态           |   数量 | 说明                                                                                 |
| -------------- | -----: | ------------------------------------------------------------------------------------ |
| ✅ Done        |      8 | 工作区及七条全部 AC 已验的故事；七条按 D-11 在当前分支结项，PR 尚未合并              |
| 🚧 In Progress |      1 | 灵感库的真实桌面 IME 未验，本轮按 D-09 跳过                                          |
| 👀 In Review   |      0 | 无                                                                                   |
| ⬜ Backlog     |      1 | 暂缓的移动设备验收                                                                   |
| 🚫 Blocked     |      2 | 原供应商预检 403；MiniMax 最新直连生成成功，浏览器原图读取未通过，仍缺三画幅交付证据 |
| **合计**       | **12** | 不含模板和上游故事                                                                   |

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

2026-10-25 逐项核对 12 条故事：79 条 AC 中 73 条已通过；[本地交付清单](plans/local-delivery-tasks.md) 17/17、[作品检索清单](plans/library-search-tasks.md) 10/10 已完成。以下 6 条仍缺真实验收，不计作已完成：

| 故事 / AC                                                                  | 剩余工作                               | 关闭所需证据                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [MEDIA-US-102 AC7](stories/generation/MEDIA-US-102-image-generation.md)    | 正式 origin 直连三画幅                 | 未知请求身份保持锁定；按最新 MiniMax 请求 ID 取回原图 URL/处理记录，先作只读核对，再取得三画幅真实直连 PNG/JPEG 原图、保存/刷新回读/精确下载证据 |
| [MEDIA-US-105 AC7](stories/generation/MEDIA-US-105-provider-management.md) | 真实供应商返回跨 origin HTTPS 图片 URL | 通过实际适配器读取、保存与精确下载，并核对原图请求没有 Authorization、Cookie 或 Referer；base64 与 fixture 不能替代                              |
| [MEDIA-US-106 AC7](stories/generation/MEDIA-US-106-prompt-gallery.md)      | 真实桌面中文输入法                     | 按 D-09 本轮跳过；后续明确恢复验收后，用真实系统 IME 验正文/字段输入、粘贴、撤销重做与焦点/布局                                                  |
| [MEDIA-US-107 AC1](stories/generation/MEDIA-US-107-mobile-verification.md) | 移动真机输入与生成                     | 按 D-04 暂缓；后续在选定设备与系统 IME 上验证输入、参数一致性与不重复生成                                                                        |
| [MEDIA-US-107 AC2](stories/generation/MEDIA-US-107-mobile-verification.md) | 移动真机持久化与交付                   | 在支持所需存储的设备上验证保存、重开、离线预览和实际文件下载                                                                                     |
| [MEDIA-US-107 AC3](stories/generation/MEDIA-US-107-mobile-verification.md) | 移动真机存储/下载失败                  | 实测系统拒绝或限制，不虚报保存/下载，重试保留已有数据和原结果                                                                                    |

按用户本次指令，七条全部 AC 已验的故事按 D-11 在当前分支记为 Done。PR #154 的远程 head `2ef6f2c5` 仍为 OPEN/DRAFT、未合并；该轮 CI 的图库 E2E 失败，PGlite 任务被 runner 关机信号中断。本地已修复备份导入的测试竞态，Chromium 全套 31/31 通过，待后续提交触发远程复验；评审/合并继续单独跟踪。原供应商只读复核新增生成 0 次；后续用户另选 MiniMax，国内区只读鉴权与原生接口预检通过，19:26:41 的原生图片请求返回 `1033 / system error`、结果待核对；用户再次明确要求独立调用后，21:08:27 新请求成功返回 JPEG 原图。MiniMax 原生适配已随正式 C 发布且公网烟测通过；本轮 PNG/JPEG 产品交付已完成并发布，700 项完整测试、32 项页面 E2E、12 个协议 fixture 与正式公网烟测通过。正式 MiniMax direct/square 生成返回业务码 0，但原图读取未取得可读响应，保持待核对；横/竖两幅未发送，102/105 继续 Blocked，详见[供应商补验记录](plans/provider-acceptance-follow-up.md)。生产 Supabase 仍属后续范围。

## 解释

MEDIA-US-001 的 ✅ 只覆盖 Nx 工作区骨架。MEDIA-US-004 的正式域名、四路由/WASM/CSP/旧 API 404、完整离线内容和官方真实 A→B→A 更新/回退已验，最终恢复 B；全 AC 为 ✅，故事按 D-11 记为 Done，PR 评审与合并单独跟踪。发布身份与证据见[正式交付验收](plans/public-delivery-verification.md)。

MEDIA-US-105/102/106 已实现供应商管理、任务日志、Tiptap 灵感库和 PNG/JPEG 交付；正式 origin 真实代理三画幅各一次成功，保存/刷新回读/精确下载已验，105 AC6、202 AC7 为 ✅。102 AC7 直连部分仍 ⚠：最新 MiniMax 正方形生成业务成功，浏览器原图读取未取得可读响应，另两幅未试；105 AC7 真实 URL 无凭据读取仍 ⚠。本机备份/冲突/中断恢复、0.0.26 升级与本地兼容守卫已验；真实桌面 IME 本轮跳过未验，移动三个 AC 暂缓。

MEDIA-US-201 的账号会话、工作区绑定、产品 RLS 和首次确认已通过真实本地验证；MEDIA-US-302 的原生复制、双副本、冲突/删除与显式重新扫描已验，D-06 不设 TTL/自动清理。本轮 Supabase 仅本地，生产服务启用属后续范围。当前测试数量与逐层边界见[验收记录](verification-report.md)。

MEDIA-US-203 的用户、模板、策略、任务和用量已通过真实本地 API/浏览器验收，生产账号/后台未部署。204 全部 AC 已通过分层本地验收：字面检索/本地整日、24 件稳定分页、真实 IO、冷启动 ready 延迟读取、全库未知态与跨工作区资源释放。原生压力为 1,005 条 metadata，全应用 IO 为 50 张图片；统一本机 E2E 31/31；实现已随正式 C 发布，四路由与离线烟测通过，功能 AC 沿用本地分层证据，PR 未合并，故事按 D-11 记为 Done，PR 待评审合并。证据与覆盖率限制见[实施清单](plans/library-search-tasks.md)，原首发未验项见[收尾清单](plans/release-completion-tasks.md)。
