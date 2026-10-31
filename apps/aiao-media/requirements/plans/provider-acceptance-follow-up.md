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

MiniMax 原生请求路径为 `/v1/image_generation`，使用 `width/height` 或 `aspect_ratio`，结果为 `data.image_urls[]` / `data.image_base64[]`。当前产品固定请求 `/images/generations`、`size`、`output_format=png`，读取 `data[0].url` / `data[0].b64_json`，所以该次探测时仅更换 Base URL 与模型不能接入；该次没有变更产品适配器、代理 allowlist 或部署。即使原生请求将来成功，仍须完成产品协议适配，并验证真实 PNG、URL 读取与正式三画幅交付，才能关闭 102 AC7 / 105 AC7。

下一步需按本次调用时间由供应商核对单次处理/用量并排查 `1033`，同时确认该 Key 的图片模型权限。102/105 继续保持 Blocked；原供应商的未知身份锁定记录继续保留。

## MiniMax 原生适配与本地验证（2026-10-25）

用户继续推进后，在工作区起点 `98d44ba9` 上补齐应用私有的原生协议适配。追加的一次国内区订阅用量 GET 仍为 HTTP 200 / 业务码 0，仅提供 `general`、`video` 两类额度窗口；没有具体图片模型权限或单次生成记录，不能用于核对 19:26:41 的 `1033` 请求。本轮新增真实生成 0 次，原生探测日志继续 `requires-review`。

| 已实现项     | 行为与边界                                                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定请求映射 | 浏览器、Worker 与正式验收脚本共用[请求协议映射](../../src/contracts/image-provider-protocol.ts)；只将 `https://api.minimax.cn/v1`、`https://api.minimax.io/v1`、`https://api.minimaxi.com/v1` 识别为 MiniMax 原生接口，其他 API 前缀沿用 Images API |
| 模型和参数   | 当前适配 `image-01`，提示词最多 1500 字符；固定单张、`response_format=url`、关闭提示词优化；三画幅通过 `width/height` 精确请求 1024×1024、1536×1024、1024×1536，不使用会改变像素尺寸的 `aspect_ratio`                                               |
| 代理契约     | 浏览器仍向 `/api/relay` 发送既有单张 Images API 参数；Worker 在允许列表和运行策略通过后映射原生路径及参数。没有自动扩展允许列表或切换通道                                                                                                           |
| 结果与错误   | 只接受业务码 0、单一 URL 或 base64 结果；拒绝混合、多张和损坏响应。1002/1004/1008/1026/2013/2049 按明确拒绝处理，1033、超时、系统错误及未知码保持不确定，不回显上游消息                                                                             |
| 原图交付     | HTTPS URL GET 不带 Authorization、Cookie、Referer，不跟随重定向，仍要求原始字节为可解码 PNG；JPEG 等非 PNG 结果拒绝保存，不转码代替真实 PNG 验收                                                                                                    |
| 配置与数据   | 通过固定官方 API 前缀选择协议；本机供应商、凭据、备份和同步记录格式保持兼容，无迁移或新增 Key 字段。供应商表单说明已同步                                                                                                                            |
| 正式验收入口 | 支持 MiniMax 原生请求和响应，按通道检查完整请求边界，记录实际参数与协议；成功身份复用，系统错误保留 `requires-review` 并拒绝重发                                                                                                                    |

先补失败测试：适配器 81 项中 21 项失败，Worker 12 项中新增 4 项失败；实现后应用完整单元测试 640/640、Worker 12/12、验收脚本守卫 15/15 通过。应用与 e2e 的 lint/typecheck 通过。

生产形态本地 fixture 已覆盖 Images API 与 MiniMax 各 6 个通道/画幅组合，共 12 个组合：实际 PNG 原图 GET 不带凭据，产品保存、刷新回读与下载逐字节一致；成功复用未增加请求，MiniMax 1033 写入待核对记录，第二次执行在请求前阻断。此证据使用合成供应商响应和图片，仅证明本地产品接线与保护，不计作真实 MiniMax 成功或正式 origin 验收。

完整覆盖率复验 36 文件、662/662 通过：行 94.65%、语句 86.74%、函数 84.72%、分支 80.30%，四项均达到 80%。新请求映射文件四项均为 100%；`local-provider.ts` 行与分支均为 100%。

适配实施阶段未部署、未重发任何真实图片请求、未改变正式代理允许列表。102 AC7/105 AC7 继续 ⚠️，故事仍 Blocked。外部继续条件仍为核对原生请求的单次处理/计费结果、确认该 Key 的 `image-01` 权限并排查 1033；之后才能按已适配入口取得真实 PNG、URL 读取和正式三画幅交付证据。

## 正式发布 C 与公网烟测

2026-10-25 20:25:47（Asia/Shanghai），将包含 MiniMax 原生适配与本地作品检索的提交 `2ef6f2c5ed1d4c24084453dff85fb9e5cd08088e` 发布到既有正式 Worker。发布审查时工作树干净；公开账号配置仍为 `null`，代理允许列表仍为原有 1 项，MiniMax 未加入生产代理允许列表。

| 项目                            | 核对结果                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| 正式 origin                     | `https://media.aiao.io`                                                    |
| Worker version C                | `caaf54dd-054b-4be8-a523-518c3875c7a9`                                     |
| Deployment                      | `3b4aed97-17e0-45b7-a446-68d7b7701e3f`                                     |
| Deployment 创建时间             | `2026-10-25T12:25:47.899953Z`                                              |
| 官方流量                        | 100% 指向 C，已通过官方 deployments API 复核                               |
| `offline-manifest.json` SHA-256 | `baefea694936345bd05eeb54a69f3b1a0fe76ddef45b8a5828fe35d4af843a33`         |
| 离线构建版本                    | `9fddbe6d2edbf56fec6d23ef009e2c63b448a26c5bfaa45d4fad53971346a69f`         |
| 发布审查                        | 60 文件，最大 1,263,008 bytes；无供应商凭据、SSR、source map 或旧 API 依赖 |
| 公网烟测                        | `fixture=false`、`passed=true`，2026-10-25T12:26:58.666Z 至 12:27:14.013Z  |

首个静态资源上传会话返回 401，未改变线上部署；官方记录及 manifest 均确认 B 保持在线后，以新官方上传会话完成发布。原 B 的 46 个公开资源已逐一核对大小/SHA-256 并在忽略目录封存，原 Worker version 回执保留。未调整生产权限或套餐，未以供应商生成探测排查发布故障。

通过 `aiao-media-e2e:public-origin-smoke` 实测正式 C：四条路由的直接 HTTP 与浏览器导航均为 200，CSP 正确，草稿刷新保留；Service Worker 缓存 46/46 资源摘要匹配、唯一 active 缓存且无 waiting。随后真断网，关闭全部旧页，再以新文档打开四条路由，均由 Service Worker 返回，工作区与草稿保持。网络统计为页面异常 0、越界请求 0、生成请求 0、远程写入 0。

烟测最初因继承的 DEBUG 被前置守卫拒绝；显式清空 DEBUG/PWDEBUG 后完成上述正式验收。最终证据为忽略目录 `apps/aiao-media-e2e/tmp/public-origin-smoke/1792931234014-caaf54dd-054b-4be8-a523-518c3875c7a9.json`；发布产物与旧 B 资源封存在 `apps/aiao-media/tmp/minimax-release-20261025`。本次冷启动限定同一隔离浏览器上下文的新文档，`upgradeVerified=false`、`rollbackVerified=false`；历史 A→B→A 的真实更新/回退证据仍归属原 B，本次未重跑 B/C 切换。

本次发布新增真实生成 0 次，两份 `requires-review` 记录内容与 0600 权限保持。发布不会解除未知请求的锁定，不能换发布身份、通道或 Key 重发同一未知请求。MiniMax `image-01` 的真实图片格式、URL 原图读取及正式三画幅交付仍未验证，102/105 继续 Blocked。

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

## MiniMax 独立原生调用成功（2026-10-25）

用户再次明确要求“minimax 单独调用试试”后，于 2026-10-25 21:08:27（Asia/Shanghai，UTC 13:08:27）向国内原生 `/v1/image_generation` 发起一次新的独立调用：`image-01`、`1024×1024`、`n=1`、`response_format=url`、`prompt_optimizer=false`，提示词为白桌上的红色陶瓷杯。此次生成 POST 共 1 次，自动重试 0 次；这次独立授权与 19:26:41 的未知尝试分开记录，旧记录内容与 `requires-review` 状态保持不变。

本次 HTTP 200，`base_resp.status_code=0`、消息 `success`，约 15.06 秒返回 1 个图片 URL。供应商响应头 `trace-id` 与响应体 `id` 均为 `072d324e75e18e7f9a3fe36dcb3cd817`。随后无 Authorization、Cookie 或 Referer 的原图 GET 返回 HTTP 200，未跟随重定向；实际字节与 Content-Type 均为 JPEG，尺寸 1024×1024，大小 105,082 bytes，SHA-256 为 `25f56be8baf32e5279802a9ff72f792f18f642a7548f32fa16b5d43add6a4c7b`。已读取原图确认可解码，原样保存为 `.jpg`，未转码。

本次独占脱敏记录为 `apps/aiao-media-e2e/tmp/provider-acceptance/minimax-native/b44125c006ee473fba62fe7e46a486ea.json`，原图为同目录同名 `.jpg`；两者权限 0600，父目录 0700，均位于 Git 忽略目录。记录不含 Key、图片 URL、原始响应或账户用量；Key 仅经隐藏输入送入进程内存，没有写入应用配置或仓库。单次计费未查询，旧 `1033` 的内部处理与计费结果仍未核对。

当前已证明此 Key 在本次国内原生组合可成功生成并下载 JPEG，不能将旧 `1033` 解释为 Key 没有图片权限。102 AC7 / 105 AC7 继续保持未完成：产品原图契约要求 PNG，此次 JPEG 原图不满足该格式要求，且尚未完成正式 origin 产品浏览器直连、三画幅保存、刷新回读与精确下载验收。本轮仅执行独立 API 诊断，没有切换正式供应商配置或扩大生产代理允许列表。

## JPEG 原图产品接入与正式补验

用户在独立 MiniMax JPEG 出图成功后要求继续 PNG/JPEG 产品交付与正式验收。共享格式校验、持久文件、下载后缀、备份恢复与同步元数据一并扩展；首次写入 JPEG 前将工作区兼容标记提高为 2，旧版本拒绝访问，原 PNG 路径保留。实现边界、验证和后续正式发布证据集中在[JPEG 交付验收](jpeg-delivery-verification.md)。原两项未知请求保留，不因本轮实现而自动解除。

JPEG 支持版本 `e6ece57b-cd1f-4834-99cb-f20813817eb2` 已正式发布，官方核对 100% 流量，公网烟测通过。22:04:17 的 MiniMax 正式 direct/square 生成返回 HTTP 200 / 业务码 0，请求 ID `072d3f68cb4bb6729477e6e2163d1f21`；后续浏览器原图读取未取得可读响应，本轮 0/3 验收通过，横/竖两幅未发出，square journal 保持 `requires-review`、自动重试 0。原因尚不能在 CORS、连接和重定向间进一步归因；按该 ID 取得原图 URL/处理记录后再作只读核对，102/105 保持 Blocked。完整发布身份、文件摘要、700/700 测试与 32/32 页面 E2E 见[JPEG 交付验收](jpeg-delivery-verification.md)。

## 结果 URL 失效与直连横图诊断（2026-10-29）

**原解锁路径作废。** MiniMax [官方文生图接口](https://platform.minimax.io/docs/api-reference/image-generation-t2i)写明 `response_format` 可选 `url` 或 `base64`，URL 24 小时后失效。2026-10-25 22:04:17 请求 `072d3f68cb4bb6729477e6e2163d1f21` 的原图地址已经失效，公开文档也没有按请求 ID 取回结果的入口，「取回同一原图 URL 再只读核对」无法执行。direct/square 保持 `requires-review`；须由用户在 MiniMax 控制台核对该笔请求的处理与计费并明确确认，才能解除该组合的锁定。

**尝试记录迁移。** 该次请求的 live 记录（身份 `4f05789a…`）与 `minimax-native` 目录所在的检出位已不存在，在全部现存工作区中都没有找到。PR #154 工作区的忽略目录 `apps/aiao-media-e2e/tmp/provider-acceptance/live`（0700）现包含：

- 从主检出位原样复制的 4 份原供应商记录（B 版本：direct/square `requires-review`/`BROWSER_TIMEOUT`，proxy 三画幅 `verified`）；
- 为 MiniMax direct/square 补建的保守锁（0600），`stage=documented-unknown-conservative-lock`、`generationRequests=null`、`documentedGenerationRequests=1`，来源为 [JPEG 交付验收](jpeg-delivery-verification.md)。按 origin、JPEG 版本、manifest、`https://api.minimax.cn/v1`、`image-01`、direct、square 重算的身份与文档记录的 `4f05789a…` 一致，说明当前私有配置与原请求组合相同。

离线调用 `checkAttemptHistory` 核对：MiniMax direct/square 无论在同一发布还是其他发布下都以 `PREVIOUS_ATTEMPT_REQUIRES_REVIEW` 阻断；direct/landscape、direct/portrait 允许。核对不联网、不读取 Key。

**线上版本。** `wrangler deployments status` 显示 100% 流量在 `e6ece57b-cd1f-4834-99cb-f20813817eb2`；正式 `offline-manifest.json` 的 SHA-256 为 `e83a9f05b54832f454e61795cf951d4843bfde004c65749fcd8e17a38e4f82cf`，与 JPEG 版本记录一致。

**直连横图诊断。** 20:37:08 以 direct/landscape 单项执行 `aiao-media-e2e:provider-acceptance`，在核对线上 manifest 时停止，`failureCode=BROWSER_OPERATION_FAILED`。单独复现为 Playwright 请求上下文 GET manifest 30 秒超时，Chrome 正常启动。本机到 Cloudflare 正式站的连接不稳定：curl 抽样 8 次中 1 次在 3 秒内返回、4 次用时 4.9–13.5 秒、3 次 15 秒超时，同期 MiniMax 与 GitHub 均在 0.3 秒内响应。失败发生在登记尝试之前：新增生成请求 0 次，没有尝试记录，运行锁已释放，横图组合仍可执行。

为避免网络在发出生成请求之后中断、把横图也锁成未知，改为每 30 秒探测一次正式站，连续 5 次在 3 秒内返回后再执行。约 20:49–21:48 的两个 30 分钟窗口共探测约 90 次，最长只连续 1 次在 3 秒内返回，按约定放弃，本轮未执行横图诊断。此后 `live` 目录仍只有上述 5 份记录、没有残留运行锁，新增生成请求为 0；direct/landscape 与 direct/portrait 仍可在网络稳定后按同一入口执行。
