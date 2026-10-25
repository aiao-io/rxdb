# 正式图片交付与公网验收

日期：2026-10-25，正式 origin：`https://media.aiao.io`。本记录仅包含已取得的真实证据；故事保持 `In Progress`，PR #154 尚未合并。供应商 URL、模型值、Key、原始响应和图片内容不进入本文件。

## 发布身份

| 项目                            | 已核对值                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| Source commit                   | `c2ab7dc0`                                                         |
| Worker version                  | `cc8cc646-560e-4d36-b0cb-2e311a2d0e25`                             |
| Deployment                      | `12606e16-5ba7-44e5-ba8f-0c7081821544`                             |
| `offline-manifest.json` SHA-256 | `9d303528a1f123d4c4dc8932fc7321b02fa5b360883a4885c9234498ed1d01fd` |
| 离线资源数                      | 46                                                                 |
| 公开账号配置                    | `null`，生产账号/同步/后台未启用                                   |
| 代理 allowlist                  | 1 项，具体供应商值保留在本机私有配置                               |

生成尝试与公网浏览器证据均绑定上述 version 和审核 manifest。更换产物后必须重新核对身份，不能将旧结果写成新发布证据。

## 真实供应商与原图交付

私有配置的带 Key 模型目录 GET 返回 HTTP 200，配置模型存在；正式 origin 的无 Key OPTIONS 返回 HTTP 403。随后用实际生产页面分别执行以下选择，Key 只进入本次调用的内存，未启用截图、trace、视频或调试日志。

| 通道/画幅         | 请求数 | HTTP       | 实际 PNG    |    字节数 | 生成原图与刷新后下载共同的 SHA-256                                 |
| ----------------- | -----: | ---------- | ----------- | --------: | ------------------------------------------------------------------ |
| direct / square   |      1 | 未收到响应 | 未取得      |         — | —                                                                  |
| proxy / square    |      1 | 200        | 1024 × 1024 | 1,363,650 | `93d00b9fd5df7e69cab00b871159f1bd7b7ec1fc6af27613c31c02f4902d235c` |
| proxy / landscape |      1 | 200        | 1536 × 1024 | 2,656,705 | `928fc8d9ab4f97b1ad52cf143a5e3fc12e1720a936134bc5386d51537430dcc3` |
| proxy / portrait  |      1 | 200        | 1024 × 1536 | 2,511,935 | `0ed5f88ffb974f23be3e52afa577f38317c673cc4d376d3547b9742e3be6b41c` |

三个 proxy 结果均为真实供应商返回的 base64 PNG；实际尺寸精确匹配请求，通过生产界面保存到 RxDB/OPFS、打开作品、刷新回读和下载，原响应解码字节与下载文件逐字节一致。每项仅发送一次生成请求，日志状态为 `verified`。

direct / square 的日志为 `requires-review`，阶段 `generation-response`，错误码 `BROWSER_TIMEOUT`，记录一次浏览器生成请求意图，没有 HTTP 回执。结合 OPTIONS 403 记录该组合的预检限制与结果未知；请求计数不证明上游是否处理，不能宣称明确拒绝、零计费或直连可用。该项未重发，direct 横向/纵向未尝试。proxy 三项是显式另选的独立验收，不是直连失败后的自动切换。

三个成功结果均无图片 URL，日志的 `credentialFreeResultRequest` 为 `null`。它们不提供“跨 origin 原图 GET 不带凭据”的真实供应商证明，MEDIA-US-105 AC7 保持 ⚠️；已有 fixture 的该项测试继续只覆盖模拟 URL 场景。

对应 AC：MEDIA-US-202 AC7 由正式 origin 的真实三画幅交付关闭；MEDIA-US-105 AC6 由代理成功组合和直连限制/未知记录关闭。MEDIA-US-102 AC7 的代理三画幅部分已验，直连部分未完成，整项保持 ⚠️，保留原有“分通道验证三种画幅”条件；不重发未知请求，不承诺直连或未经验证的供应商、模型和参数组合。

本机原始 journal 位于 Git 忽略的 `apps/aiao-media-e2e/tmp/provider-acceptance/live/`。该次目录有 4 项：1 个 direct/square 未知，3 个 proxy 已验证；文档只提取枚举、合法数值与摘要。继续工作时保留未知记录，选中它仍应阻断；仅复用同发布已验证项或显式选择独立未尝试项，不重发付费请求。

## 正式 origin 浏览器与离线证据

本机原始 JSON：`apps/aiao-media-e2e/tmp/public-origin-smoke/1792901770395-cc8cc646-560e-4d36-b0cb-2e311a2d0e25.json`。开始时间为 `2026-10-25T04:15:58.528Z`，完成于 `2026-10-25T04:16:10.394Z`，`fixture=false`、`passed=true`。

| 检查                | 结果与边界                                                                              |
| ------------------- | --------------------------------------------------------------------------------------- |
| 在线四路由          | `/`、`/create`、`/images`、`/providers` 均 HTTP 200，响应包含所检查的 CSP 指令          |
| 活跃 Service Worker | 预期 `/offline-worker.js` 已激活，无 waiting worker，仅 1 份版本缓存                    |
| 缓存完整性          | 46/46 项大小与 SHA-256 匹配审核构建                                                     |
| 断网证明            | 设置离线后，带随机 query、`no-store` 的资源请求失败，排除仅命中原缓存却未真正断网的情况 |
| 离线新文档启动      | 关闭全部旧页面后，新开四路由页面均 HTTP 200 且 `fromServiceWorker=true`                 |
| 本机状态            | 四路由保持相同 profile；草稿刷新恢复，并在离线新 `/create` 页面读回                     |
| 网络副作用          | 0 生成请求、0 远程写请求、0 不安全请求、0 page error                                    |

这是同一隔离浏览器 context 内的新文档冷启动，未证明浏览器进程重启后的持久化。非创作路由验证了应用壳，未逐项验证其全部页面主体。该样本没有供应商配置或原图，尚未完成 MEDIA-US-004 AC3 所需的完整内容回读；实际发布更新/回退另待验，JSON 的 `upgradeVerified`、`rollbackVerified` 均为 `false`。

## Cloudflare 计划范围

2026-10-25 在 Cloudflare 控制台实读：Workers Plans 当前套餐显示免费、US$0；Billing Subscriptions 中 Workers Free 为活动状态。账户另有既有订阅。此证据确认本 Worker 使用的计划范围，不将其写成全账户免费、全账户零账单或第三方模型费用为零。

## 本地 Supabase 复验

同日仅运行 `aiao-media:product-test` 及其 `supabase-up`、`supabase-migrate` 依赖，28.0 秒通过；4 组真实本地 API 断言覆盖绑定/A-B 隔离、DTO/CAS/tombstone、模板/显式任务上报/用量来源、管理员/封禁/审计。本应用 6 个服务 healthy，保持运行供后续本地浏览器使用，其它 RxDB 栈未改动。

命令均使用 `NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false`，`localEnvironment()` 只从 infra 私有 `.env` 构造回环地址，未修改用户 `.env`。API 日志位于本机 `/tmp/aiao-media-final-local-product-api.log`。

随后顺序执行 `aiao-media-e2e:supabase-e2e` 和 `aiao-media-e2e:product-e2e`，真实本地 Auth 3/3、产品 7/7 场景通过；两套浏览器没有并行运行。日志分别为 `/tmp/aiao-media-final-local-auth-browser.log`、`/tmp/aiao-media-final-local-product-browser.log`。当前本地预览的公开配置指向回环 Supabase，携带本地公开 Key 的 Auth 健康检查返回 200；生产账号/后台仍未部署。

## 复验入口与生产账号隔离

正式只读浏览器检查使用 `aiao-media-e2e:public-origin-smoke`，生成检查使用 `aiao-media-e2e:provider-acceptance`；前者不生成图片，后者可能计费。执行入口与 selector 见[收尾清单](release-completion-tasks.md)。现有三个 proxy 已验证结果应复用，direct 未知项继续锁定，不能为了补证据重发。

本轮生产构建、产物审查和部署必须同时设置 `NX_LOAD_DOT_ENV_FILES=false` 与两个公开账号空值，例如：

```sh
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false \
AIAO_SUPABASE_URL='' AIAO_SUPABASE_ANON_KEY='' \
pnpm nx run aiao-media:deploy --skipRemoteCache
```

相同环境前缀也适用于 `offline-assets`、`release-check` 和 `deploy-check`。仅设置两个空值不足以约束 Nx 加载私有 `.env` 的行为；产物必须再次核对 `app-config.js` 为 `null`。此命令记录部署边界，不代表应在只读复验时再次部署。

剩余项为 MEDIA-US-102 AC7 的直连部分、真实 URL 结果的无凭据读取、正式离线配置/原图回读以及实际发布更新/回退。直连未知请求不重发。桌面 IME 按用户决定跳过未验，移动三个 AC 暂缓；这些状态与生产 Supabase 后续范围分别保留。
