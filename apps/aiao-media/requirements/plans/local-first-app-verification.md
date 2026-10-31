# Local-first 真实应用集成验证

本记录保留该阶段实际执行的基线与证据；最新实现、测试数量和收尾边界见[本地产品交付验收](local-delivery-verification.md)与[收尾清单](release-completion-tasks.md)。

当前本地基线：2026-10-24，Asia/Shanghai。本记录对应工作区里的默认 Angular 应用。

## 已实现

- 默认 CSR 入口为 `LocalImageMvp`。`aiao-media:serve` 无 API 启动依赖，生产不生成 SSR server bundle。
- 无登录启动固定本机 UUID 工作区；RxDB / wa-sqlite / IndexedDB 保存配置、草稿和任务，storage plugin / OPFS 保存真实 PNG。
- 供应商 CRUD、默认选择、用户 Base URL / 模型 / Key、自建配置默认直连；默认预设明确显示代理通道，生成须由用户点击。
- 默认 Key 仅当前页面内存；记住模式写入独立的 `provider-keys-v1` 本机凭据记录，不进入供应商元数据、任务或备份。
- 请求前写本机日志；Web Locks 防止本机标签页同时生成。未知结果不重发，用户核对后才能解除锁定。
- 四页面离线缓存，图片下载/删除/提示词复用，完整无 Key JSON 备份及隔离恢复。
- Cloudflare Static Assets 与无状态 `/api/relay`，精确允许列表、固定上游路径、受限请求、超时、流式结果、无敏感日志/持久化。

## 本机验证结果

`aiao-media-e2e:local-first-e2e`：27/27 通过，包括 11 项本机图片场景、12 项本地可靠性场景与 4 项账号 fixture 场景。运行实际生产静态包、Chrome、RxDB、WASM、IndexedDB、OPFS、Service Worker；供应商响应为 fixture，不产生真实模型费用。

1. 无旧登录/API 调用，配置与草稿刷新恢复，图片保存、下载和回读。
2. 网络失败结果未知，刷新后仍锁定，不自动重发或调用代理。
3. 默认内存 Key 刷新丢弃；主动代理才向 `/api/relay` 发送本次凭据。
4. 四路由离线冷启动，配置、草稿仍可读。
5. 390px 移动布局不横向溢出。
6. 备份包含原图与草稿、不含 Key，恢复后可离线查看。
7. 损坏备份不切换工作区、不清除配置。
8. 正方形、横向、纵向均保存原图，每次只有一次生成请求。
9. 两标签页并发操作只产生一次生成请求。
10. OPFS 写入失败仍可下载，恢复后重试保存不再次生成。
11. 首次无配置时自动建立无凭据的默认供应商，生成前引导填写 Key。

本地可靠性场景覆盖 Key 记住/替换/移除、非法配置/PNG、跨 origin 原图精确下载与信息/复用/删除、保存确认前关页恢复、删除中断清理、备份超限/坏摘要/重复 ID/中断续导、schema 守卫、双标签草稿冲突选择、模板字段与撤销隔离，以及图片/编辑器资源失败；见[可靠性验收](local-reliability-verification.md)。

账号 fixture 覆盖未配置时无连接、登录恢复与备份排除、确认邮箱/错误提示，以及离线验证与跨标签退出。真实本地 Auth 另由 `aiao-media:supabase-e2e` 的 3 项浏览器测试验证，见[账号验收说明](supabase-account-verification.md)。

其他检查：

- `aiao-media:relay-test`：4/4 通过，覆盖同源/允许列表/参数限制、凭据转发、无缓存、敏感错误清理、无自动重试及静态路由。
- `aiao-media:test` 与 `aiao-media:test` 通过。
- web、local-data、web-e2e 的类型检查和 lint 通过；supabase 工具脚本 lint 通过。
- `aiao-media:requirements-check` 通过，13 个检查器测试通过，需求与文档链接无错误。
- `aiao-media:release-check`：无业务凭据、SSR 运行时、source map 或旧 API 调用；必需 WASM/离线资源存在。精确文件清单和摘要在 Git 忽略的 `tmp/local-first/release.json`。
- Wrangler 4.152.0 dry-run 通过，Worker 约 13.68 KiB，未上传业务 Key。

## 正式发布状态

正式发布地址：`https://aiao-media.aiao.workers.dev`。Version ID：`92883918-76ac-47de-a424-4bc5af23bee9`。部署使用 Workers Static Assets + 同 Worker `/api/relay`，无容器和数据库；真实供应商公网链路仍待单独验收。

## 公网发布验证（2026-10-23）

- 正式地址：`https://aiao-media.aiao.workers.dev`
- Worker：`aiao-media`
- Version ID：`92883918-76ac-47de-a424-4bc5af23bee9`
- `/`、`/create`、`/images`、`/providers`：HTTP 200，均返回同一 CSR shell。
- `/offline-worker.js`：HTTP 200，`cache-control: no-cache`。
- `/wa-sqlite/wa-sqlite-async.wasm`：HTTP 200，`application/wasm`。
- `/api/auth/session`：HTTP 404 `Unknown API`，说明旧认证接口未发布。
- `/api/relay` GET：HTTP 405 `POST required`；未允许的代理 Base URL 返回 HTTP 403。
- Chrome headless 公网烟测：四路由标题、导航、页面主标题均存在；无 console error 或 page error。
- 发布使用 Workers Static Assets + Worker，不使用 Container、D1、R2、KV、Supabase 或数据库。

## 待公网验证

- 当前构建的正式域名发布、账号 Free 计划与账单状态。
- 正式域名的四路由、WASM、CSP、离线安装和更新。
- 正式 origin 的真实供应商 CORS 与生成/保存链路，分别记录直连与代理，不互相代替。
- 桌面真实系统中文输入法；移动设备验收暂缓，不阻断桌面工作。

首发的凭据、删除/journal、备份中断和草稿冲突已通过本地验收。历史迁移、正式发布回退、供应商及桌面真实 IME 仍按[验收记录](../verification-report.md)收口，先于同步扩展；负责人决策见[待决策事项](../decisions.md)。

既有网关在本机 origin 的 CORS 403 证据仍见 [直连实测记录](local-first-direct-probe-verification.md)。本次未重新触发真实收费生成；fixture 通过不证明该网关在正式域名支持浏览器直连。

相关：[当前路线图](../roadmap.md)、[部署说明](../../deploy/local-first-pages.md)、[项目说明](../../README.md)。
