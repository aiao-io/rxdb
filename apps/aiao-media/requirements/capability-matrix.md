# 当前能力矩阵

> 产品实装能力，不是依赖库列表。状态以 [故事 YAML](status-overview.md) 为准。✅ 仅覆盖格内明确限定的范围；⚠️ 表示设施/部分能力，不等于完整交付；⬜ 未交付。

| 能力                   | 当前状态                                                                                                                                | 对应故事                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 无登录本地工作区       | ✅ 固定本机 UUID、RxDB + wa-sqlite/IndexedDB、OPFS 文件；刷新/离线恢复已验                                                              | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 图片供应商管理         | ✅ 本机 CRUD、默认选择、URL/模型校验、Key 记住/替换/单独移除；Key 不进入备份/任务/日志                                                  | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |
| 浏览器直连生成         | ⚠️ 正式 origin 代理真实三画幅交付已验；102 AC7 直连正方形未知且未重发，横向/纵向未尝试                                                  | [MEDIA-US-102](stories/generation/MEDIA-US-102-image-generation.md)         |
| 可选代理 `/api/relay`  | ✅ 同源、允许列表、按请求 Key、无缓存/日志、超时/流式限制；4 项 relay 测试通过                                                          | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 图片提示词灵感库       | ⚠️ 12 条模板、Tiptap 输入/字段/撤销隔离、资源失败恢复；桌面真实 OS 中文 IME 本轮跳过、保持未验；移动验收暂缓                            | [MEDIA-US-106](stories/generation/MEDIA-US-106-prompt-gallery.md)           |
| 离线与备份             | ✅ 四路由离线冷启动、无 Key JSON 备份/隔离恢复；超限、坏摘要/重复 ID 拒绝及中断续导已验                                                 | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 本机图片作品           | ✅ 正式 origin 真实供应商代理三画幅保存/刷新回读/精确下载已验；复用、删除及 journal 中断恢复保留各自本地证据                            | [MEDIA-US-202](stories/account/MEDIA-US-202-library.md)                     |
| 本地作品检索与可见预览 | ✅ 本地验收通过：字面 AND/整日、24 件原生分页、ready 冷启动零原图读与 metadata 未知态；1,005 metadata 压力、50 图 IO/同文档切换，未部署 | [MEDIA-US-204](stories/account/MEDIA-US-204-library-search.md)              |
| 真实图片 URL 读取      | ⚠️ 已成功结果均为 base64；105 AC7 的真实跨 origin URL 原图无凭据读取仍待验                                                              | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |
| schema 兼容守卫        | ⚠️ 0.0.26 升级及未知/更高 marker 拒写已通过本地验证；正式同 schema 1 的 A→B→A 回退已验，不承诺任意历史库迁移或线上 schema 转换          | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 静态发布               | ✅ `media.aiao.io` 四路由/WASM/CSP/旧 API 404、完整离线内容与真实 A→B→A 更新/回退已验；最终恢复 B，004 全 AC✅、故事未合并仍 Progress   | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 可选 Supabase 账号会话 | ⚠️ 注册/确认/登录/恢复/退出、工作区绑定与产品 RLS 已通过真实本地验证；本轮仅本地，生产启用属后续范围                                    | [MEDIA-US-201](stories/account/MEDIA-US-201-sessions.md)                    |
| Supabase 跨设备复制    | ⚠️ 原生双副本、离线/重开、冲突/删除传播与显式重新扫描已通过真实本地验收；D-06 不设 TTL/自动清理，生产服务属后续范围                     | [MEDIA-US-302](stories/local-first/MEDIA-US-302-draft-sync.md)              |
| 供应商配置同步         | ✅ 两独立副本公开配置同步已验；固定排除 Key                                                                                             | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |

当前范围不包含 SSR、旧 Bun API/自建 PostgreSQL 业务栈、服务端任务队列/证据机、音视频和 Electron 桌面。本轮 Supabase 为独立本地栈，生产账号/后台未部署；受保护的管理 API 已通过本地 Worker 验收。正式发布与证据边界见[正式交付验收](plans/public-delivery-verification.md)。

| 计划中能力     | 当前状态                                                                                           | 对应故事                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 跨用户业务后台 | ⚠️ 用户、模板、运行策略、显式上报与来源明确的用量已通过真实本地服务/浏览器验收；生产启用属后续范围 | [MEDIA-US-203](stories/account/MEDIA-US-203-business-admin.md)         |
| 移动设备验收   | ⬜ 暂缓，不阻断桌面、同步和后台工作                                                                | [MEDIA-US-107](stories/generation/MEDIA-US-107-mobile-verification.md) |
