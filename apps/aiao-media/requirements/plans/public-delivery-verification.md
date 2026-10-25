# 正式图片交付与公网验收

日期：2026-10-25，正式 origin：`https://media.aiao.io`。本记录仅包含已取得的真实证据；故事保持 `In Progress`，PR #154 尚未合并。供应商 URL、模型值、Key、原始响应和图片内容不进入本文件。

## 发布身份

| 项目                            | 已核对值                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| Source commit                   | `c2ab7dc0`                                                         |
| Worker version                  | `cc8cc646-560e-4d36-b0cb-2e311a2d0e25`                             |
| 原始生成验收 Deployment         | `12606e16-5ba7-44e5-ba8f-0c7081821544`                             |
| 恢复后的当前 Deployment         | `aac93845-7add-4fd3-b45a-d37dfc5d1319`                             |
| 当前 Deployment 创建时间        | `2026-10-25T04:36:20.644433Z`                                      |
| 当前官方流量                    | 100% 指向上述 Worker version B                                     |
| `offline-manifest.json` SHA-256 | `9d303528a1f123d4c4dc8932fc7321b02fa5b360883a4885c9234498ed1d01fd` |
| 离线资源数                      | 46                                                                 |
| 公开账号配置                    | `null`，生产账号/同步/后台未启用                                   |
| 代理 allowlist                  | 1 项，具体供应商值保留在本机私有配置                               |

生成尝试对应原始 Deployment；真实更新验收结束后，官方回退恢复同一 version B，产生当前 Deployment。官方 API 已重新核对 100% 流量、manifest 和账号配置 `null`。不同 Deployment 不冒充同次操作，但上述 B 的产物身份一致。

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

恢复 B 后的最终本机 JSON：`apps/aiao-media-e2e/tmp/public-origin-smoke/1792903093530-cc8cc646-560e-4d36-b0cb-2e311a2d0e25.json`。开始时间为 `2026-10-25T04:37:59.598Z`，完成于 `2026-10-25T04:38:13.529Z`，`fixture=false`、`passed=true`；该次目标耗时 14.2 秒。

| 检查                | 结果与边界                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| 在线四路由          | `/`、`/create`、`/images`、`/providers` 的直接 HTTP 与浏览器导航均 200，响应包含所检查的 CSP 指令 |
| 活跃 Service Worker | 预期 `/offline-worker.js` 已激活，无 waiting worker，仅 1 份版本缓存                              |
| 缓存完整性          | 46/46 项大小与 SHA-256 匹配审核构建                                                               |
| 断网证明            | 设置离线后，带随机 query、`no-store` 的资源请求失败，排除仅命中原缓存却未真正断网的情况           |
| 离线新文档启动      | 关闭全部旧页面后，新开四路由页面均 HTTP 200 且 `fromServiceWorker=true`                           |
| 本机状态            | 四路由保持相同 profile；草稿刷新恢复，并在离线新 `/create` 页面读回                               |
| 网络副作用          | 0 生成请求、0 远程写请求、0 不安全请求、0 page error                                              |

这是同一隔离浏览器 context 内的新文档冷启动，未证明浏览器进程重启后的持久化；非创作路由在此套件只验证应用壳。此 smoke 样本没有供应商配置或原图，`upgradeVerified`、`rollbackVerified` 均为 `false`。完整配置/原图与更新/回退证据由下面独立的真实产物套件提供，不扩大这份 smoke JSON 的范围。

## 真实产物更新与正式回退

本机证据：`apps/aiao-media/.wrangler/local-first/actual-release-update/evidence.json`，`scope=formal-real-artifact-update`，真实 live 目标耗时 1 分 8 秒。先封存并本地预验两份完整真实静态产物，两个 manifest 摘要与入口文件均不同；没有注入构建标记或更高 schema marker。

| 产物           | 官方 Worker version                    | 审核 manifest SHA-256                                              | 实际主入口          |
| -------------- | -------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| A，封存基线 A5 | `8b21d041-2324-4eca-b2ef-60e75e77bac8` | `6f47e3d7346f0a3c6bf6834b92ae66156e79dd13aabb4e7de81dbb253626ab23` | `/main-MIXFN4DO.js` |
| B，当前发布    | `cc8cc646-560e-4d36-b0cb-2e311a2d0e25` | `9d303528a1f123d4c4dc8932fc7321b02fa5b360883a4885c9234498ed1d01fd` | `/main-QJQZZHTY.js` |

| 真实步骤       | 浏览器与数据证据                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| 官方发布 A     | 通过产品备份导入合法 fixture PNG、测试供应商配置与草稿；在同一隔离 context 中建立固定工作区                         |
| A → 官方回退 B | 新 worker 进入 waiting 时旧 DOM 保持原构建；关闭旧页面后等待新 worker activated，再开页面核对 B 的真实入口与缓存    |
| B → 官方回退 A | 重复 waiting/旧 DOM 不变/关闭旧页/activated/新页面验证，实际重新加载 A 的入口和缓存                                 |
| 每阶段真断网   | 随机 query 的无缓存请求失败；四路由导航均由 Service Worker 响应，相同 profile 与 schema marker `1` 保持             |
| 配置/草稿/原图 | 供应商全部非敏感配置与空 Key、草稿保持；每次转换后原图均可精确下载，源字节/SHA-256 一致                             |
| 最终恢复       | 浏览器序列为 A→B→A；结束后再次官方回退 B，API 核对 100% 流量、B 的审核 manifest 与账号配置 `null`，`restoredB=true` |

原图 SHA-256：`26dc5fd3704ec4326753aa45e56b301d00f4f31cb57fa0ad57c69c7341816aea`。该 PNG 是通过实际产品备份导入的合法 fixture 原图，**不是供应商生成结果**；本套件 `generationRequests=0`，未追加真实生成。

MEDIA-US-004 AC1–4 因真实发布、实际 allowlist 1 项/代理三画幅、已通过的运行边界测试，以及上述完整离线内容/更新/回退证据标为 ✅；故事仍为 `In Progress`，PR 未合并。未知/更高 marker 拒写另引用已通过的本地兼容守卫范围；本次线上 A/B 同为 schema `1`，没有执行真实 schema 转换或在线注入更高 marker。

## Cloudflare 计划范围

2026-10-25 在 Cloudflare 控制台实读：Workers Plans 当前套餐显示免费、US$0；Billing Subscriptions 中 Workers Free 为活动状态。账户另有既有订阅。此证据确认本 Worker 使用的计划范围，不将其写成全账户免费、全账户零账单或第三方模型费用为零。

## 本地 Supabase 复验

同日仅运行 `aiao-media:product-test` 及其 `supabase-up`、`supabase-migrate` 依赖，28.0 秒通过；4 组真实本地 API 断言覆盖绑定/A-B 隔离、DTO/CAS/tombstone、模板/显式任务上报/用量来源、管理员/封禁/审计。本应用 6 个服务 healthy，保持运行供后续本地浏览器使用，其它 RxDB 栈未改动。

命令均使用 `NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false`，`localEnvironment()` 只从 infra 私有 `.env` 构造回环地址，未修改用户 `.env`。API 日志位于本机 `/tmp/aiao-media-final-local-product-api.log`。

随后顺序执行 `aiao-media-e2e:supabase-e2e` 和 `aiao-media-e2e:product-e2e`，真实本地 Auth 3/3、产品 7/7 场景通过；两套浏览器没有并行运行。日志分别为 `/tmp/aiao-media-final-local-auth-browser.log`、`/tmp/aiao-media-final-local-product-browser.log`。当前本地预览的公开配置指向回环 Supabase，携带本地公开 Key 的 Auth 健康检查返回 200；生产账号/后台仍未部署。

## 复验入口与生产账号隔离

正式只读浏览器检查使用 `aiao-media-e2e:public-origin-smoke`，生成检查使用 `aiao-media-e2e:provider-acceptance`；前者不生成图片，后者可能计费。执行入口与 selector 见[收尾清单](release-completion-tasks.md)。现有三个 proxy 已验证结果应复用，direct 未知项继续锁定，不能为了补证据重发。

真实版本切换使用 `aiao-media-e2e:actual-release-update-live`，会调用官方发布/回退命令改变正式静态版本。使用前必须封存 `apps/aiao-media/tmp/public-release-baseline` 与 `apps/aiao-media/tmp/public-release-current` 两份真实完整产物，先通过 `actual-release-update-check` 和 `actual-release-update-fixture` 本地预验；两份产物的审核摘要、版本和入口须不同，不能用同一构建改测试标记代替。此入口不允许追加 shell 参数，非敏感环境参数如下：

| 参数                                  | 要求                                           |
| ------------------------------------- | ---------------------------------------------- |
| `AIAO_MEDIA_UPDATE_LIVE`              | 必须显式为 `1`                                 |
| `AIAO_MEDIA_UPDATE_ORIGIN`            | 固定 `https://media.aiao.io`                   |
| `AIAO_MEDIA_UPDATE_VERSION_B`         | 预先核验的正式 B version UUID                  |
| `AIAO_MEDIA_UPDATE_MANIFEST_A_SHA256` | 封存并审核的 A manifest SHA-256                |
| `AIAO_MEDIA_UPDATE_MANIFEST_B_SHA256` | 封存并审核的 B manifest SHA-256，必须与 A 不同 |

默认 CI 仅挂接真实更新的 guard 与本地 public smoke fixture，并保留既有本地离线回归；不设置 live opt-in，不官方部署或调用真实供应商。最终本机 lint/typecheck、12 provider guards/6 组合 fixture、3 public guards/public fixture、12 actual-update guards 共 7 个 target，27.2 秒通过，没有 root build 或额外真实生成。

本轮生产构建、产物审查和部署必须同时设置 `NX_LOAD_DOT_ENV_FILES=false` 与两个公开账号空值，例如：

```sh
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false \
AIAO_SUPABASE_URL='' AIAO_SUPABASE_ANON_KEY='' \
pnpm nx run aiao-media:deploy --skipRemoteCache
```

相同环境前缀也适用于 `offline-assets`、`release-check` 和 `deploy-check`。仅设置两个空值不足以约束 Nx 加载私有 `.env` 的行为；产物必须再次核对 `app-config.js` 为 `null`。此命令记录部署边界，不代表应在只读复验时再次部署。

剩余项为 MEDIA-US-102 AC7 的直连部分与 MEDIA-US-105 AC7 的真实 URL 结果无凭据读取。直连未知请求不重发。桌面 IME 按用户决定跳过未验，移动三个 AC 暂缓；这些状态与生产 Supabase 后续范围分别保留。
