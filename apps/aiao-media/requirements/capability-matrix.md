# 当前能力矩阵

> 产品实装能力，不是依赖库列表。状态以 [故事 YAML](status-overview.md) 为准。✅ 仅覆盖格内明确限定的范围；⚠️ 表示设施/部分能力，不等于完整交付；⬜ 未交付。

| 能力                   | 当前状态                                                                                                               | 对应故事                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 无登录本地工作区       | ✅ 固定本机 UUID、RxDB + wa-sqlite/IndexedDB、OPFS 文件；刷新/离线恢复已验                                             | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 图片供应商管理         | ✅ 本机 CRUD、默认选择、URL/模型校验、Key 记住/替换/单独移除；Key 不进入备份/任务/日志                                 | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |
| 浏览器直连生成         | ⚠️ 直连 + 主动代理，本地任务日志、单张 PNG 保存/回读；真实供应商正式 origin CORS 待验                                  | [MEDIA-US-102](stories/generation/MEDIA-US-102-image-generation.md)         |
| 可选代理 `/api/relay`  | ✅ 同源、允许列表、按请求 Key、无缓存/日志、超时/流式限制；4 项 relay 测试通过                                         | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 图片提示词灵感库       | ⚠️ 12 条模板、Tiptap 输入/字段/撤销隔离、资源失败恢复；桌面真实 OS 中文 IME 保留；移动验收暂缓                         | [MEDIA-US-106](stories/generation/MEDIA-US-106-prompt-gallery.md)           |
| 离线与备份             | ✅ 四路由离线冷启动、无 Key JSON 备份/隔离恢复；超限、坏摘要/重复 ID 拒绝及中断续导已验                                | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 本机图片作品           | ✅ 原图信息/精确下载、复用、删除/无副本提示、保存与删除 journal 中断恢复已验；供应商为 fixture                         | [MEDIA-US-202](stories/account/MEDIA-US-202-library.md)                     |
| schema 兼容守卫        | ⚠️ 本版本在打开/操作前拒绝不兼容数据；历史库迁移与正式回退仍待验                                                       | [MEDIA-US-301](stories/local-first/MEDIA-US-301-browser-persistence.md)     |
| 静态发布               | ⚠️ 已发布 `aiao-media.aiao.workers.dev`，四路由/WASM/旧 API 404 已验；正式域名 media.aiao.io 路由已配置，绑定/发布待验 | [MEDIA-US-004](stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) |
| 可选 Supabase 账号会话 | ⚠️ 注册/确认/登录/恢复/退出、工作区绑定与产品 RLS 已通过真实本地验证                                                   | [MEDIA-US-201](stories/account/MEDIA-US-201-sessions.md)                    |
| Supabase 跨设备复制    | ⚠️ 原生 adapter/plugin 已接线；真实本地双独立副本、离线/重开、冲突与删除传播通过，TTL/正式环境保留                     | [MEDIA-US-302](stories/local-first/MEDIA-US-302-draft-sync.md)              |
| 供应商配置同步         | ✅ 两独立副本公开配置同步已验；固定排除 Key                                                                            | [MEDIA-US-105](stories/generation/MEDIA-US-105-provider-management.md)      |

当前范围不包含 SSR/BFF、Bun API、PostgreSQL、服务端任务队列/证据机、音视频和 Electron 桌面。

| 计划中能力     | 当前状态                                                                                              | 对应故事                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 跨用户业务后台 | ⚠️ 用户、模板、运行策略、显式任务上报和来源明确的用量已通过本地服务与浏览器/Worker 验证；正式环境待验 | [MEDIA-US-203](stories/account/MEDIA-US-203-business-admin.md)         |
| 移动设备验收   | ⬜ 暂缓，不阻断桌面、同步和后台工作                                                                   | [MEDIA-US-107](stories/generation/MEDIA-US-107-mobile-verification.md) |
