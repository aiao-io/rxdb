# 决策与执行条件

本页记录负责人已确定的范围和按需提供的外部条件。**决策确定不等于实现或验收完成**；实现状态仍以 story YAML 和 AC 为准，见[状态概览](status-overview.md)。

| ID   | 当前结论                                            | 执行方式                                                                                                                                                                                                                                                                                                                                   | 对应范围                                    |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| D-01 | 已确定：正式域名 `media.aiao.io`                    | 正式 origin 为 `https://media.aiao.io`；用该 origin 验证生成、CSP、离线安装/更新及存储。旧 workers.dev 数据经备份导出/导入迁移                                                                                                                                                                                                             | MEDIA-US-004；MEDIA-US-102/105/202 正式验收 |
| D-02 | 历史阶段：本机 Key 直连验证，已由 D-19 取代         | 原口径：应用私有 `.env` 提供真实供应商测试额度，直连/主动代理分别留证，Key 不进入 Git、静态包或报告。D-19 起用户不再配置供应商，模型与凭据由平台统一托管                                                                                                                                                                                   | MEDIA-US-102 AC 7；MEDIA-US-105（已出范围） |
| D-03 | 已确定：使用本机已登录的部署/管理账户               | 优先复用本机授权；实际需要项目、zone、公开账号配置或服务端凭据时再获取。登录部署平台不等于获得产品管理员角色；服务端管理凭据不进入浏览器                                                                                                                                                                                                   | MEDIA-US-004；MEDIA-US-201；MEDIA-US-203    |
| D-04 | 已确定：移动端暂缓，优先能力验证与跨用户业务后台    | 当前验收以桌面浏览器为目标。后台覆盖用户、模板、任务和用量，见 [MEDIA-US-203](stories/account/MEDIA-US-203-business-admin.md)；积分管理见 [MEDIA-US-206](stories/account/MEDIA-US-206-credit-admin.md)。移动验收保留在 [MEDIA-US-107](stories/generation/MEDIA-US-107-mobile-verification.md)，不阻断当前桌面工作                          | MEDIA-US-102/106/301；MEDIA-US-203          |
| D-05 | 已确定：本机独立工作区 + 显式绑定 + 按账号隔离复制  | 退出继续本机使用，切账号不复用另一账号的绑定副本。登录不上传，首次确认后才复制；流程见[账号与工作区计划](plans/account-workspace-binding.md)                                                                                                                                                                                               | MEDIA-US-201 阶段 B；MEDIA-US-302 阶段 A/B  |
| D-06 | 已确定：无限期保留，不启用 TTL 或自动清理           | 保留 tombstone、冲突原始双方和同步变更日志，不重置远程序列。检查点不按时间过期；异常恢复采用用户明确触发的重新扫描，保留本机未确认改动、业务 revision 和推送水位，由现有 CAS/冲突流程处理重放。后续 GC 必须另做安全回收协议与离线设备恢复验收                                                                                              | MEDIA-US-302 阶段 C                         |
| D-07 | 已确定：只承诺已验证的迁移与安全回退范围            | 支持 0.0.26 基线升级；新版库不降级给旧引擎，拒绝打开后恢复新版数据仍在。未验证历史库不承诺自动迁移；未知/更高 schema marker 拒绝访问并保留原数据。线上回退仅选择认识 schema marker 且通过同库验收的构建，不用清库解决回退                                                                                                                  | MEDIA-US-301 AC 8；MEDIA-US-004 AC 4        |
| D-08 | 历史阶段：Supabase 仅本地，已由 D-16 的正式启用扩展 | 图片首发阶段只做本地账号/同步验证、正式产物关闭账号配置；2026-11-06 已按 D-16 初始化平台项目并发布。真实云 API/RLS/Storage 结果及公众注册邮件限制见[平台发布记录](plans/platform-supabase-release-20261106.md)，原本地证据不扩大为全部生产验收                                                                                             | MEDIA-US-004；MEDIA-US-201/203/303/305      |
| D-09 | 历史阶段：真实桌面 IME 曾暂缓，2026-11-14 已补验    | 原脚本因 `IME_FOCUS_LOST` 中止的记录保留，不用粘贴或合成 composition 事件冒充通过。后续经原生 UI 工具向 macOS 简体拼音发送真实物理按键，正文/字段跨自动保存组字、粘贴、撤销重做、焦点和刷新恢复均已通过，MEDIA-US-106 AC7 已验，见[收口记录](plans/requirements-completion-20261114.md#真实系统中文输入法)。移动真机继续按 D-04 暂缓       | MEDIA-US-106 AC7；MEDIA-US-107              |
| D-10 | 已确定：本地作品检索与真实视口按需预览              | 独立 prompt/model 原生字面 contains、大小写敏感 AND；本地整日，createdAt/实体 id 稳定倒序，每页 24。仅 IO 相交卡片预览并回收失效 URL；ready 冷启动不读原图，saving 完整验证后提交，显式读取不改写历史保存事实；全库 metadata 未知时不推断无副本。无 schema/packages 改动；验收分层见[实施清单](plans/library-search-tasks.md)              | MEDIA-US-204                                |
| D-11 | 已确定：全部 AC 已验的七条故事在合并前记为 Done     | MEDIA-US-004/201/202/203/204/301/302 按当前分支验收结果结项，评审/合并单独跟踪。仅这七条采用此口径，其他故事保留默认关闭条件，未验 AC 不计为通过                                                                                                                                                                                           | 七条已验故事及派生视图                      |
| D-12 | 已确定：原图扩展为 PNG/JPEG                         | 依据原始字节确认 MIME、尺寸和解码，JPEG 原样保存与下载，PNG 路径和数据库结构保留。首次保存 JPEG 原图或投影 JPEG 元数据前，在工作区锁内先将兼容标记升为 2，旧版本拒绝访问；新版兼容标记 1/2，禁止降低标记回退。备份版本仍为 1、从原图识别格式；作品同步只增加 JPEG MIME，SQL 007 前向扩展，仅本地验证。真实生成仍逐项单次、未知结果保留锁定 | MEDIA-US-102/105/202/301/302                |

## 后续产品方向

### D-13：未来功能与目录演进

已确定的产品方向：继续优化 Web；提供 Tauri 本地安装程序；在海外 Cloudflare、国内自建 Node 运行安全代理及管理 API；同步方向统一按 D-16 使用平台 Supabase。平台生图按 D-19 改为登录+积分，充值收费仍按 D-17 暂缓。

首阶段已进入实施，技术选择和证据见[产品交付计划](plans/product-completion-20261030.md)。完整范围与共同数据边界见[未来功能需求与目录规划](future-requirements.md)。方向确定不等于验收完成；平台账号与同步的实际启用见 D-16 和正式发布记录，D-06 的同步保留规则与既有故事验收状态保持不变。

### D-14：自有 Supabase 授权接入与原图同步（已由 D-16 替代）

原方案曾计划通过管理 OAuth 授权、项目选择和自动初始化接入用户自有 Supabase。2026-11-06 用户撤销此方向，明确统一使用平台 Supabase，并允许删除未使用的接入代码。原 MEDIA-US-304 故事及相关入口、模块和配置已移除；撤销范围不表示原 OAuth 或身份引导通过验收。当前平台账号与原图范围分别以 MEDIA-US-303/305 和 D-16 为准。

### D-15：本站代理生图改为服务端任务

代理通道的生成改为服务端任务（海外 Cloudflare，国内 Node）：刷新、关闭页面或短暂断网后回到页面，可以续接并取回结果。一次一张，与现有本机生成锁一致，不做多张排队。海外结果暂存在独立私有 R2 bucket，取回即删，生命周期规则兜底删除；国内使用独立私有密文文件与持久闹钟清理。Cloudflare 路径需要 R2 订阅，国内运行边界见 D-18。上游 Key 按 D-19 改由平台凭据持有，浏览器直连与按请求 Key 的无状态代理随 D-19 移除。

先补需求与计划再实现：[MEDIA-US-109](stories/generation/MEDIA-US-109-relay-durable-task.md) 定义授权、加密、有效期与删除，选型依据见[实施计划](plans/relay-durable-tasks.md)。本决策不表示已实现。

### D-16：统一使用平台 Supabase

2026-11-06 用户确定：所有账号与同步统一使用我们维护的 Supabase 项目，用户只需注册或登录平台账号，再确认同步数据范围；不再提供用户自有项目、管理 OAuth、项目选择或自动初始化入口。本决策替代 D-13 的双目标方向与 D-14 的用户自有项目接入方案。

草稿、供应商公开配置与作品信息继续复用现有 Supabase adapter、history 和 sync 插件；PNG/JPEG 原图通过同一平台项目的私有 Storage 上传和按需取回，原图上传范围单独确认。按平台账号和工作区隔离，API Key、服务端私钥、用户会话和本机路径不进入业务同步。

表、RLS、bucket 和平台账号配置由部署方统一维护。应用尚未正式使用，移除未使用的自有项目代码与兼容入口，不承诺旧自有项目配置迁移。用户确认平台账号、工作区与上传范围后才开始复制。停止、切账号、离线恢复、冲突、tombstone 和日志保留规则继续遵守 D-05/D-06。

[MEDIA-US-303](stories/local-first/MEDIA-US-303-sync-targets.md) 与 [MEDIA-US-305](stories/local-first/MEDIA-US-305-supabase-image-sync.md) 按本决策继续实施；原 MEDIA-US-304 需求与未使用的自有项目接入代码一并移除。平台承担存储与服务成本。2026-11-06 正式启用的版本、空库初始化、真实云 API/RLS/Storage 及完整浏览器同步样本证据见[平台发布记录](plans/platform-supabase-release-20261106.md)；22:07 发布版本的正式四路由与离线浏览器 smoke 已通过，58/58 资源摘要匹配。自定义 SMTP 与公众注册邮件、续传及生产 Web/Tauri 仍需验收，决策或部署不等于故事全部完成。

### D-17：充值/退款与价格体系暂缓（平台生图已按 D-19 恢复为积分制）

2026-11-06 用户确定当前平台免费，移除创作页“平台图片服务”和后台“平台生图与计费”，关闭 `/api/platform/` 对外 API；2026-11-13 按 D-19 恢复平台生图（登录+积分、模型由平台托管）。模型价格、积分购买与消费对账等计费范围仍退出当前产品；积分由后台发放（[MEDIA-US-206](stories/account/MEDIA-US-206-credit-admin.md)）。

[MEDIA-US-205](stories/account/MEDIA-US-205-platform-billing.md) 继续 Backlog，待未来收费需求明确后重新评审范围、实现和验收。保留后端历史实现与验收证据，存量任务、订单、流水和原图不删除；保留代码不表示服务仍对外开放。

平台生图、平台账号、元数据和私有原图同步继续按各自故事推进，不依赖平台计费。平台免费不代表基础设施或模型调用没有成本。

### D-18：国内自建与海外托管两种部署

2026-11-09 用户明确：国内使用 `aliyun-self` 自建 Supabase，允许清理旧业务，并部署 Caddy 公网 IP HTTPS；海外继续使用 Cloudflare 和 Supabase 托管服务。两种部署复用产品契约，国内增加 Node 入口、SQLite 任务与加密文件适配；账号与同步数据仍由对应部署的平台 Supabase 维护。

本次按独立账号与数据区域实施，不增加跨区身份或图库复制。国内入口为 `https://47.103.117.118`；当前关闭公众注册，初始确认账号由可信运维创建。SMTP、站外备份、实际模型压力与桌面联验仍需分别完成。实现与真实验证见 [MEDIA-US-006](stories/platform/MEDIA-US-006-self-hosted-deployment.md)、[双部署方案](plans/dual-region-deployment.md)和[国内发布记录](plans/self-hosted-release-20261109.md)。

### D-19：登录用户经平台积分生图，移除用户自配供应商

2026-11-13 用户确定：改版后用户不再配置供应商，模型与凭据由平台在服务端统一托管。生成入口为登录平台账号且有可用积分；未登录保留本机工作区（灵感浏览、提示词草稿与本机作品），登录+积分只作为生成与跨设备同步的门槛。

积分由后台管理发放，支持增加与减少用户积分并记录流水（[MEDIA-US-206](stories/account/MEDIA-US-206-credit-admin.md)）；充值、退款与价格体系不在本次范围（[MEDIA-US-205](stories/account/MEDIA-US-205-platform-billing.md) 继续按 D-17 暂缓）。

移除用户端供应商配置、直连生成与按请求 Key 的入口与代码：MEDIA-US-105 出范围；MEDIA-US-102 收缩为本机交付；D-02 的本机 Key 验证口径由本决策取代。服务端生成任务与刷新续接复用 [MEDIA-US-109](stories/generation/MEDIA-US-109-relay-durable-task.md) 已实现机制，上游 Key 改由平台凭据，无状态 `/api/relay` 随本次改版移除。

国内自建与海外托管共用同一套平台生图契约（D-18），积分账本与发放入口两侧一致。需求设计见 [MEDIA-US-108](stories/generation/MEDIA-US-108-platform-generation.md) 与 [MEDIA-US-206](stories/account/MEDIA-US-206-credit-admin.md)。2026-11-13 已实现账本、后台调整与用户余额/流水，MEDIA-US-206 AC1–4 已通过本地验证，见[积分交付证据](plans/credits-delivery-20261113.md)；生成前后端接线与本地浏览器验收已完成，见[平台接线记录](plans/platform-relay-credits-20261113.md)；双部署正式验收继续推进。

## 当前执行条件

- 平台模型凭据：保存在服务端受保护配置，不进入 Web/桌面产物、任务响应或管理页面（D-19）。原本机 `.env` 真实供应商验收口径（未知记录不删除、不覆盖，不因更换发布、产物或 Key 解锁）已由 D-19 取代，历史记录见[收尾清单](plans/release-completion-tasks.md#真实供应商自动验收入口)。
- 正式发布：保持 `NX_LOAD_DOT_ENV_FILES=false`，显式提供同一平台项目的 `AIAO_SUPABASE_URL` 和公开 `AIAO_SUPABASE_ANON_KEY`；Worker 配置同项目 secrets，不能发布本机回环值。当前发布流程见[部署说明](../deploy/cloudflare/local-first-pages.md#正式发布)，历史关闭账号的发布回执仍保留。
- 正式域名路由在 [Wrangler 配置](../apps/api/wrangler.json)；线上当前版本与历次发布身份见[验收记录](verification-report.md#正式环境证据)。域名绑定、证书与发布均以部署回执和公网检查为准。
- Cloudflare：控制台显示 Workers 免费套餐 US$0 与活动 Workers Free 订阅；账户另有既有订阅，不据此宣称全账户免费、零账单或模型费用为零。
- 平台 Supabase 已按 D-16 正式初始化并发布；公众注册仍缺自定义 SMTP 与确认邮件验收。生产配置和权限依据实际回执，不从 `.env` 字段存在推断；后续运维与未验边界见[收尾清单](plans/release-completion-tasks.md#后续正式账号服务的运维边界)与[平台发布记录](plans/platform-supabase-release-20261106.md)。

## 版本与证据

应用已迁入 RxDB 工作区，依赖本仓 `0.0.28` 的 RxDB、wa-sqlite adapter 和 storage plugin；Supabase JS 使用工作区 `^2.117.3`。本机持久化、旧 0.0.26 数据升级和真实本地 Auth 已通过[迁入验收](plans/rxdb-import-verification.md)。

最小同步已消费本仓 Supabase adapter、history 与 sync plugin，产品绑定、DTO/RLS 和双独立副本已通过[本地产品验收](plans/local-delivery-verification.md)；本地通过不代表正式服务已上线。原仓基线和依赖版本见[导入清单](plans/source-import.json)，不再以同级仓库软链接或另装 0.0.26 作为构建前置。

相关：[路线图](roadmap.md)、[验收记录](verification-report.md)、[后台实施计划](plans/business-admin.md)。
