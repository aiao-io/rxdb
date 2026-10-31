# 当前能力矩阵

> 产品实装能力，不是依赖库列表。状态以 [故事 YAML](status-overview.md) 为准。✅ 仅覆盖格内明确限定的范围；⚠️ 表示设施/部分能力，不等于完整交付；⬜ 未交付。证据来自哪一层见[验收记录](verification-report.md)。

| 能力                   | 当前状态                                                                                                                                     | 对应故事                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 无登录本地工作区       | ✅ 固定本机 UUID、RxDB + wa-sqlite/IndexedDB、OPFS 文件；刷新/离线恢复已验                                                                   | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 图片供应商管理         | ✅ 本机 CRUD、默认选择、URL/模型校验、Key 记住/替换/单独移除；Key 不进入备份/任务/日志                                                       | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |
| 浏览器直连生成         | ⚠️ 本地 fixture 全覆盖；正式 origin 直连三画幅尚无成功证据，剩余条件见[状态概览](status-overview.md#未完成验收与关闭条件)                    | [MEDIA-US-102](stories/generation/MEDIA-US-102-image-generation.md)         |
| 可选代理 `/api/relay`  | ✅ 同源、允许列表、按请求 Key、无缓存/日志、超时/流式限制；正式 origin 原供应商代理三画幅已验                                                | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 原图格式               | ✅ PNG/JPEG 按原始字节识别、原样保存与下载；首次写入 JPEG 前将工作区兼容标记升为 2，旧版本拒绝访问                                           | [MEDIA-US-102](stories/generation/MEDIA-US-102-image-generation.md)         |
| 图片提示词灵感库       | ⚠️ 12 条模板、Tiptap 输入/字段/撤销隔离、资源失败恢复；真实系统中文 IME 未验，移动验收暂缓                                                   | [MEDIA-US-106](stories/generation/MEDIA-US-106-prompt-gallery.md)           |
| 离线与备份             | ✅ 四路由离线冷启动、无 Key JSON 备份/隔离恢复；超限、坏摘要/重复 ID 拒绝及中断续导已验                                                      | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 本机图片作品           | ✅ 正式 origin 真实供应商代理三画幅保存/刷新回读/精确下载已验；复用、删除及 journal 中断恢复有本地证据                                       | [MEDIA-US-202](stories/account/MEDIA-US-202-library.md)                     |
| 本地作品检索与可见预览 | ✅ 字面 AND/整日、24 件原生分页、只为视口内卡片读原图、ready 冷启动零原图读；本地分层验收，非 1,000 张原图的 UI 实测                         | [MEDIA-US-204](stories/account/MEDIA-US-204-library-search.md)              |
| 真实图片 URL 读取      | ⚠️ 适配器支持无凭据读取跨 origin HTTPS 原图并有 fixture 证据；真实供应商 URL 原图读取未验                                                    | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |
| schema 兼容守卫        | ⚠️ 0.0.26 升级及未知/更高 marker 拒写已通过本地验证；正式同 schema 1 的 A→B→A 回退已验，不承诺任意历史库迁移或线上 schema 转换               | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 静态发布               | ✅ `media.aiao.io` 四路由/WASM/CSP/旧 API 404、完整离线内容与真实 A→B→A 更新/回退已验                                                        | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 可选 Supabase 账号会话 | ⚠️ 注册/确认/登录/恢复/退出、工作区绑定与产品 RLS 已通过真实本地验证；正式产物关闭账号配置                                                   | [MEDIA-US-201](stories/account/MEDIA-US-201-sessions.md)                    |
| Supabase 跨设备复制    | ⚠️ 草稿、供应商公开配置与作品元数据的原生双副本、离线/重开、冲突/删除与显式重新扫描已通过真实本地验收；Key、原图、句柄与本地文件标识固定排除 | [MEDIA-US-302](stories/local-first/MEDIA-US-302-draft-sync.md)              |
| 供应商配置同步         | ✅ 两独立副本公开配置同步已验；固定排除 Key                                                                                                  | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |

当前范围不包含 SSR、旧 Bun API/自建 PostgreSQL 业务栈、音视频和 Electron 桌面；新增持久平台任务见下表。Supabase 为独立本地栈，生产账号/后台未部署；受保护的管理 API 已通过本地 Worker 验收。

Tauri、Cloudflare 平台任务与计费、同步目标已进入实施，代码及各层证据见下表。正式发行与生产服务尚未验收，不计入上表既有已验范围。

| 计划中能力     | 当前状态                                                                                           | 对应故事                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 跨用户业务后台 | ⚠️ 用户、模板、运行策略、显式上报与来源明确的用量已通过真实本地服务/浏览器验收；生产启用属后续范围 | [MEDIA-US-203](stories/account/MEDIA-US-203-business-admin.md)         |
| 移动设备验收   | ⬜ 暂缓，不阻断桌面、同步和后台工作                                                                | [MEDIA-US-107](stories/generation/MEDIA-US-107-mobile-verification.md) |

## 产品扩展实施

| 能力                   | 当前边界                                                                                             | 故事                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Tauri 安装版           | ⚠️ 原生数据库/文件、指针与兼容守卫已接线，前端构建与两项 Rust 测试通过；实际安装、签名公证和升级待验 | [MEDIA-US-005](stories/platform/MEDIA-US-005-tauri-desktop.md)                |
| 平台持久生图           | ⚠️ 原子额度、预算、队列、未知不重发、原图入 R2 与 UI 已接线；正式配置和真实平台生成待验              | [MEDIA-US-108](stories/generation/MEDIA-US-108-platform-generation.md)        |
| 支付与运维             | ⚠️ Checkout、验签、积分/退款、审计和运维界面已接线；真实商户付款、退款和对账待验                     | [MEDIA-US-205](stories/account/MEDIA-US-205-platform-billing.md)              |
| 两种同步目标           | ⚠️ 自有项目选择、兼容检查、停止/导出/配额/逻辑删除已接线；新入口完整双副本和生产跨设备待验           | [MEDIA-US-303](stories/local-first/MEDIA-US-303-sync-targets.md)              |
| Supabase 授权自动接入  | ⬜ 仅需求：官方 OAuth、选项目、确认后自动初始化和项目同步身份引导；当前仍需手工配置                  | [MEDIA-US-304](stories/local-first/MEDIA-US-304-supabase-oauth-onboarding.md) |
| 自有 Supabase 原图同步 | ⬜ 仅需求：独立范围确认、私有原图上传/续传、跨设备取回和删除恢复；现有连接不上传原图                 | [MEDIA-US-305](stories/local-first/MEDIA-US-305-supabase-image-sync.md)       |

扩展实现的统一证据见[产品交付计划](plans/product-completion-20261030.md)。
