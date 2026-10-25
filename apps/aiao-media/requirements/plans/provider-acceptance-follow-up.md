# 供应商正式补验记录

日期：2026-10-25（Asia/Shanghai）。源码基线 `7651e58e`；用户要求继续补齐 MEDIA-US-102 AC7 的直连部分与 MEDIA-US-105 AC7 的真实 URL 结果。私有供应商配置从应用 `.env` 读入内存，报告仅保留状态、布尔值、摘要与数值。

## 原供应商只读复核

| 检查                         | 结果                                                                                                       | 可判定范围                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 正式 `offline-manifest.json` | HTTP 200，SHA-256 `9d303528a1f123d4c4dc8932fc7321b02fa5b360883a4885c9234498ed1d01fd`                       | 与已审核正式 B 一致；本轮未部署                                                                |
| 配置模型目录 GET             | HTTP 200，共 2 个模型，配置模型存在                                                                        | 凭据与模型目录可读；不等于生成直连或 URL 结果可用                                              |
| 正式 origin 的生成 OPTIONS   | HTTP 403，无允许 origin、POST、Authorization 或 Content-Type 的 CORS 响应头                                | 当前组合的浏览器直连前置条件不满足；同供应商 `/v1` 前缀的只读 OPTIONS 也为 403                 |
| 供应商公开用量入口 GET       | HTTP 200，Key 有效；2026-10-25 汇总为 6 次请求                                                             | 只有按日/模型汇总，无单次请求 ID、原图或结果；无法关联原未知请求，也不能据此推断零计费或未处理 |
| 本机原始尝试日志             | 当前工作区 `tmp/provider-acceptance/live` 与封存正式产物目录在复核开始时不存在；同级旧仓未找到原 live 日志 | 原三项 proxy 成功仍引用既有正式验收记录；不从文字伪造已完成 journal                            |
| 原配置复核生成               | 0 次                                                                                                       | 仅模型目录、公开前端资源、OPTIONS、用量与正式 manifest 的读取，没有生成 POST                   |

现有三项真实 proxy 成功仍为 base64，没有返回跨 origin 图片 URL。现有适配器支持 URL 响应时的无凭据读取，已有 fixture 覆盖其协议与下载行为；这些不能补成真实供应商 URL 验收。

## MiniMax 单次原生接口探测（2026-10-25）

用户明确另选 MiniMax 后，按[官方文生图接口](https://platform.minimax.cn/docs/api-reference/image-generation-t2i)核对协议，先做只读区域与 CORS 检查，再发送一张 `image-01`、`1024x1024`、`n=1`、`response_format=url` 的原生请求。调用时间为 2026-10-25 19:26:41（Asia/Shanghai，UTC 11:26:41）；这次探测不经正式产品适配器。

| 检查                 | 结果                                                              | 可判定范围                                                          |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| 国内区订阅用量 GET   | HTTP 200，`base_resp.status_code=0`，存在用量数据                 | 此 Key 可通过国内区只读接口鉴权；不据此推断图片模型权限             |
| 国际区订阅用量 GET   | HTTP 200，业务码 `2049`                                           | 此 Key 未通过国际区鉴权；图片请求只发到已通过鉴权的国内区           |
| 原生图片接口 OPTIONS | HTTP 200，允许正式 origin、POST、Authorization 与 Content-Type    | 原生接口的预检条件满足；不等于已完成正式产品浏览器直连              |
| 单次原生图片 POST    | HTTP 200，业务码 `1033`，消息 `system error`，返回图片 URL 数为 0 | 未取得图片；不能将 HTTP 200 计作生成成功，也不能断定 Key 无图片权限 |
| 结果读取与交付       | 无可读取的真实图片 URL 或 PNG                                     | 原图 CORS、无凭据 GET、图片格式、保存、刷新回读与精确下载均未验     |

[官方错误码](https://platform.minimax.cn/docs/api-reference/errorcode)将 `1033` 定义为系统错误/下游服务错误。图片请求共发送 1 次、自动重试 0 次，尚未确认供应商内部处理与计费结果；保守保持 `requires-review`，同一原生组合不重发。忽略目录 `apps/aiao-media-e2e/tmp/provider-acceptance/minimax-native` 中保留独占创建的 0600 尝试记录，父目录为 0700，身份摘要为 `d3ab25b72bc1084b1205f04bdf274619d291d830fba116eed6d558385d5c447b`。记录仅含状态与脱敏摘要，不含 Key、原始响应或账户用量。

不能仅凭 Key 前缀认定图片权限：[当前 M Plan FAQ](https://platform.minimax.cn/docs/m-plan/faq)包含图像生成能力，[旧 Token Plan 说明](https://platform.minimax.cn/docs/m-plan/token-plan-notice)则保留原有套餐权益；本轮未确认该账号具体套餐与图片模型权限。

MiniMax 原生请求路径为 `/v1/image_generation`，使用 `width/height` 或 `aspect_ratio`，结果为 `data.image_urls[]` / `data.image_base64[]`。当前产品固定请求 `/images/generations`、`size`、`output_format=png`，读取 `data[0].url` / `data[0].b64_json`，所以仅更换 Base URL 与模型不能接入；本轮没有变更产品适配器、代理 allowlist 或部署。即使原生请求将来成功，仍须完成产品协议适配，并验证真实 PNG、URL 读取与正式三画幅交付，才能关闭 102 AC7 / 105 AC7。

下一步需按本次调用时间由供应商核对单次处理/用量并排查 `1033`，同时确认该 Key 的图片模型权限。102/105 继续保持 Blocked；原供应商的未知身份锁定记录继续保留。

## 未知请求保护

原 direct/square 的未知状态继续保留。因本机旧 journal 缺失，在忽略的 `apps/aiao-media-e2e/tmp/provider-acceptance/live` 独占写入 0600 的保守锁定记录，父目录为 0700；按当前私有供应商/模型、正式 B、审核 manifest、direct/square 计算既有身份。

记录标记为 `documented-unknown-conservative-lock` / `requires-review`，来源是[正式交付记录](public-delivery-verification.md)。`generationRequests` 为 `null`，仅另存文档报告的 1 次浏览器请求意图；不是恢复出的原始日志，也没有新增生成。既有 runner 读取该身份会拒绝重发。未为三项 proxy 成功伪造 journal，未覆盖或删除旧未知记录。

## 关闭所需输入

| 对应 AC          | 还缺什么                                                               | 可继续执行的条件                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIA-US-102 AC7 | 可用于正式 origin 的真实直连组合；原未知身份的继续执行另须单次核对证据 | 供应商提供允许该 origin、Authorization/Content-Type 和 POST 的 CORS；原未知身份保留锁定，可显式另选未尝试组合，单次执行三画幅并保存、刷新回读与精确下载 |
| MEDIA-US-105 AC7 | 按现有请求契约返回真实跨 origin HTTPS PNG URL 的组合                   | 配置实际支持该行为的供应商/模型；其图片 host 允许浏览器读取，随后通过真实产品验证无 Authorization/Cookie/Referer、保存及精确下载                        |

本轮两个 AC 继续保持 ⚠️，两条故事记为 Blocked。用户可在本机私有 `.env` 配置符合条件的供应商，凭据不进入聊天或 Git；若要继续原未知身份，核对结果由供应商单次记录提供；明确另选的不同供应商组合可独立验收，旧未知记录仍保留。桌面 IME 跳过、移动真机暂缓、Supabase 仅本地等既定范围保持。

## 本轮校验

验收脚本现在会将旧记录阻断输出为固定的 `PREVIOUS_ATTEMPT_REQUIRES_REVIEW`，不回显供应商 URL、Key 或原始异常。先为该诊断补断言，`provider-acceptance-check` 首轮 11/12、该断言失败；实现后 12/12 通过。

`aiao-media-e2e:lint` 与 `typecheck` 通过；`aiao-media:requirements-check` 17/17、537 个本地链接与 10 个锚点通过，状态统计为 8 Done / 1 In Progress / 0 In Review / 1 Backlog / 2 Blocked。

用正式 origin、已审核 B、direct/square 单项执行真实验收入口，结果为 `planned=1`、`verified=0`、`phase=stopped`、`failureCode=PREVIOUS_ATTEMPT_REQUIRES_REVIEW`。该目标按保护逻辑以非零状态停止；这是拒绝重发的实证，供应商验收仍未通过，新增生成为 0。保守锁文件仍为 `requires-review`。
