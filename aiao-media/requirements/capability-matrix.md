# 当前能力矩阵

> 产品实装能力，不是依赖库列表。状态以 [故事 YAML](status-overview.md) 为准。✅ 仅覆盖格内明确限定的范围；⚠️ 表示设施/部分能力，不等于完整交付；⬜ 未交付。证据来自哪一层见[验收记录](verification-report.md)。

| 能力                   | 当前状态                                                                                                                                                                                    | 对应故事                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 无登录本地工作区       | ✅ 固定本机 UUID、RxDB + wa-sqlite/IndexedDB、OPFS 文件；刷新/离线恢复已验；未登录保留草稿、灵感浏览与本机作品（D-19）                                                                      | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 平台生图服务端入口     | ✅ 同源任务接口、允许列表、超时/流式限制、去重与加密暂存 R2；按请求 Key 的旧代理按 D-19 移除                                                                                                | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 平台积分生图           | ⬜ 需求已按 D-19 设计（登录+积分、模型平台托管、消费与流水）；实现与验收尚未开始                                                                                                            | [MEDIA-US-108](stories/generation/MEDIA-US-108-platform-generation.md)      |
| 原图格式               | ✅ PNG/JPEG 按原始字节识别、原样保存与下载；首次写入 JPEG 前将工作区兼容标记升为 2，旧版本拒绝访问                                                                                          | [MEDIA-US-102](stories/generation/MEDIA-US-102-image-generation.md)         |
| 图片提示词灵感库       | ⚠️ 12 条模板、Tiptap 输入/字段/撤销隔离、资源失败恢复；真实系统中文 IME 未验，移动验收暂缓                                                                                                  | [MEDIA-US-106](stories/generation/MEDIA-US-106-prompt-gallery.md)           |
| 离线与备份             | ✅ 四路由离线冷启动、无凭据 JSON 备份/隔离恢复；超限、坏摘要/重复 ID 拒绝及中断续导已验                                                                                                     | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 本机图片作品           | ✅ 保存/刷新回读/精确下载已验；复用、删除及 journal 中断恢复有本地证据                                                                                                                      | [MEDIA-US-202](stories/account/MEDIA-US-202-library.md)                     |
| 本地作品检索与可见预览 | ✅ 字面 AND/整日、24 件原生分页、只为视口内卡片读原图、ready 冷启动零原图读；本地分层验收，非 1,000 张原图的 UI 实测                                                                        | [MEDIA-US-204](stories/account/MEDIA-US-204-library-search.md)              |
| schema 兼容守卫        | ⚠️ 0.0.26 升级及未知/更高 marker 拒写已通过本地验证；正式同 schema 1 的 A→B→A 回退已验，不承诺任意历史库迁移或线上 schema 转换                                                              | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 静态发布               | ✅ `media.aiao.io` 四路由/WASM/CSP/旧 API 404、完整离线内容与真实 A→B→A 更新/回退已验                                                                                                       | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 可选 Supabase 账号会话 | ⚠️ 注册/确认/登录/恢复/退出、工作区绑定与产品 RLS 已通过真实本地验证；正式产物已按 D-16 启用平台账号配置，公众注册邮件未验（见[平台发布记录](plans/platform-supabase-release-20261106.md)） | [MEDIA-US-201](stories/account/MEDIA-US-201-sessions.md)                    |
| Supabase 跨设备复制    | ⚠️ 草稿与作品元数据的原生双副本、离线/重开、冲突/删除与显式重新扫描已通过真实本地验收，正式云第二设备草稿恢复已验；凭据、原图、句柄与本地文件标识固定排除                                   | [MEDIA-US-302](stories/local-first/MEDIA-US-302-draft-sync.md)              |

当前范围不包含 SSR、旧 Bun API/自建 PostgreSQL 业务栈、音视频和 Electron 桌面；用户自配供应商、浏览器直连与按请求 Key 的代理已按 [D-19](decisions.md#d-19登录用户经平台积分生图移除用户自配供应商) 移除，其历史验收证据见[正式交付验收](plans/public-delivery-verification.md)与[供应商补验](plans/provider-acceptance-follow-up.md)。平台 Supabase 已按 D-16 正式部署（Web 账号与同步）；生产管理后台未部署，受保护的管理 API 已通过本地 Worker 验收。

Tauri 与平台同步继续实施；充值计费仍按 D-17 暂缓。Tauri 正式发行与桌面生产服务尚未验收，不计入上表既有已验范围。

| 计划中能力     | 当前状态                                                                             | 对应故事                                                               |
| -------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 跨用户业务后台 | ⚠️ 用户、模板、任务与来源明确的用量已通过真实本地服务/浏览器验收；生产启用属后续范围 | [MEDIA-US-203](stories/account/MEDIA-US-203-business-admin.md)         |
| 移动设备验收   | ⬜ 暂缓，不阻断桌面、同步和后台工作                                                  | [MEDIA-US-107](stories/generation/MEDIA-US-107-mobile-verification.md) |

## 产品扩展实施

| 能力                   | 当前边界                                                                                                                                                                 | 故事                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Tauri 安装版           | ⚠️ 原生数据库/文件、指针与兼容守卫已接线，前端构建与两项 Rust 测试通过；实际安装、签名公证和升级待验                                                                     | [MEDIA-US-005](stories/platform/MEDIA-US-005-tauri-desktop.md)          |
| 国内自建部署           | ⚠️ 公网 Caddy IP HTTPS、自建 Supabase/Storage、Node 任务与整机重启已通过 11-09 发布验收；公众 SMTP、站外备份、模型压力与桌面联验待完成                                   | [MEDIA-US-006](stories/platform/MEDIA-US-006-self-hosted-deployment.md) |
| 首次安装与后台初始化   | ⚠️ self-hosted/Cloudflare 双形态安装向导、管理员账号与安装状态持久化已实现并通过本地与隔离真实 GoTrue 验证；国内已随 11-09 发布真实部署，Cloudflare 生产部署待合入后执行 | [MEDIA-US-007](stories/platform/MEDIA-US-007-installation.md)           |
| 后台积分管理           | ⬜ 需求已按 D-19 设计（增/减用户积分、流水与权限）；实现与验收尚未开始                                                                                                   | [MEDIA-US-206](stories/account/MEDIA-US-206-credit-admin.md)            |
| 平台支付与运维         | ⬜ D-17 暂缓；积分由后台发放，充值、退款与价格体系待未来收费需求明确后重新评审                                                                                           | [MEDIA-US-205](stories/account/MEDIA-US-205-platform-billing.md)        |
| 平台账号同步           | ⚠️ 按 D-16 统一平台；平台注册入口与正式云登录、元数据同步、第二设备草稿恢复已验，生产 Tauri 跨设备与配额管理待验                                                         | [MEDIA-US-303](stories/local-first/MEDIA-US-303-sync-targets.md)        |
| 平台 Supabase 原图同步 | ⚠️ 独立范围确认与私有 Storage 传输已接线，正式云 Web 原图上传/下载字节一致已验；持久队列、续传、删除冲突与 Tauri 跨设备待验                                              | [MEDIA-US-305](stories/local-first/MEDIA-US-305-supabase-image-sync.md) |

扩展实现的统一证据见[产品交付计划](plans/product-completion-20261030.md)。

国内自建部署（MEDIA-US-006）为真实公网部署；上表其余「真实本地验收」类表述不代表该部署未启用。公众 SMTP、站外备份及桌面原图联验尚未完成。
