# JPEG 原图交付与 MiniMax 正式验收

日期：2026-10-25（Asia/Shanghai）。用户在 MiniMax 独立原生调用成功后要求继续产品接入与真实验收，范围依据 [D-12](../decisions.md)。

## 交付范围

- 供应商结果按原始字节识别 PNG/JPEG，先限制文件大小和尺寸，再验证可解码性及实际尺寸；不依赖 URL 后缀或 HTTP Content-Type 推断格式，不转码原图。
- 原 PNG 路径保持 `<jobId>.png`，JPEG 使用 `<jobId>.jpg`；保存、回读、预览、恢复与删除均使用匹配的媒体类型。图库保持原生分页与视口读取，不为获取格式提前读取全库原图。
- 生成结果和图库下载使用真实格式后缀；备份格式仍为版本 1，从原始图片字节恢复 MIME，校验摘要和解码后再写入隔离工作区。
- 首次保存 JPEG 原图或投影 JPEG 元数据前，在同一工作区锁内先把兼容标记从 1 提高为 2；新版兼容 1/2，未知版本拒绝访问。标记写入失败时停止 JPEG 写入。旧 C 只认识标记 1，JPEG 工作区不能回退给 C，也不降低或删除标记。
- SQLite 表结构不变；作品同步公共元数据扩展为 PNG/JPEG，SQL 007 前向扩展数据库校验，生产初始化包包含 10 个源文件。PostgreSQL 行为由真实 PGlite 引擎验证；本轮不启用生产 Supabase。
- 真实验收脚本识别两种格式，比较供应商原始结果与刷新后下载的精确字节，校验实际尺寸，并验证跨 origin 原图 GET 不携带 Authorization、Cookie 或 Referer。

## 本地验证

先补失败测试：MiniMax JPEG 的 URL/base64 两项均被旧 PNG 校验拒绝；真实浏览器保存 JPEG 失败。随后新增兼容标记断言，旧实现在保存 JPEG 后仍保留标记 1，测试失败。

包含兼容标记 2 的完整覆盖率复验 700/700 通过：行 94.96%、语句 87.23%、函数 84.88%、分支 80.44%，四项均达到 80%。实际生产包的完整 Chromium 页面 E2E 32/32 通过，覆盖 JPEG 原图 URL 读取、生成页与图库的 `.jpg` 精确下载、刷新回读、备份恢复及标记 2；未知标记 3 拒绝访问。应用与 e2e 的 lint/typecheck 均通过。Images API PNG/MiniMax JPEG 共 12 个生产 Worker fixture 组合最终复验全部通过，成功证据复用与未知结果阻断均不增加生成请求；这些本地 fixture 证据不计作真实 MiniMax 正式 origin 成功。

## 发布与真实验收

发布前保留并校验正式 C 的 59 个静态文件：version `caaf54dd-054b-4be8-a523-518c3875c7a9`，manifest SHA-256 `baefea694936345bd05eeb54a69f3b1a0fe76ddef45b8a5828fe35d4af843a33`。保存位置为忽略目录 `apps/aiao-media/tmp/jpeg-release-20261025/previous`；该旧版本不支持 JPEG 工作区。

2026-10-25 21:59:23（Asia/Shanghai），将 `b9c6ceef` 加当前 JPEG 补丁发布到既有 Worker。源码存在未提交改动；`apps/aiao-media/tmp/jpeg-release-20261025/source-and-build.json` 保留补丁摘要和逐文件 SHA-256，不把旧提交冒充包含本轮实现的完整提交。

| 发布项           | 结果                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| Worker version   | `e6ece57b-cd1f-4834-99cb-f20813817eb2`                                  |
| Deployment       | `22dc6044-f537-4a55-b77f-a1263196077f`，官方 deployments 核对 100% 流量 |
| Manifest SHA-256 | `e83a9f05b54832f454e61795cf951d4843bfde004c65749fcd8e17a38e4f82cf`      |
| Offline version  | `80fd151589716fa504815d82b96eff0cd70b409abe7d04a5e6265fd6b242cec0`      |
| 发布审查         | 60 文件，最大 1,263,008 bytes，无供应商凭据、SSR、source map 或旧 API   |
| 账号与代理       | 公开账号配置 `null`，代理允许列表保留原有 1 项，MiniMax 未加入          |

真实公网烟测通过：四路由直接 HTTP 与浏览器导航均为 200、CSP 正常，草稿刷新保留，46/46 缓存摘要匹配；实际断网后关闭旧页面，新文档四路由从 Service Worker 打开且保留工作区。页面异常、越界请求、生成和远程写入均为 0。证据为 `apps/aiao-media-e2e/tmp/public-origin-smoke/1792936853406-e6ece57b-cd1f-4834-99cb-f20813817eb2.json`。本次未执行真实版本更新/回退，不把旧 B/C 证据挪到新版本。

正式 MiniMax 产品验收于 2026-10-25 22:04:17 发起 direct/square 单项。生成 POST 共 1 次，HTTP 200，`base_resp.status_code=0`，供应商请求 ID `072d3f68cb4bb6729477e6e2163d1f21`，返回单个 HTTPS 图片 URL。后续正式浏览器未取得该 URL 对应的可读原图响应，验收在 `generation-json` 阶段等待响应失败，固定诊断为 `BROWSER_ASSERTION / EXPECTED_VALUE`；不能定位为 JPEG 解码失败，也尚不能区分 CORS、网络连接或重定向原因。

本次真实产品已验证 0/3；square 的生成请求已返回业务成功，但原图读取、保存、刷新回读和精确下载均未通过正式验收。landscape / portrait 两项未发送。独占记录 `apps/aiao-media-e2e/tmp/provider-acceptance/live/4f05789a9f5a6715d2c2d5a42fdbc1183a32b7bedbb7a2fb67a520e5bbc80f89.json` 保持 `requires-review`，自动重试 0。报告保留请求 ID、业务码与固定错误枚举，不含 Key、完整响应或图片 URL；URL 没有持久化，当前无法对同一原图执行独立只读复核。需要按该请求 ID 从供应商取得结果 URL/处理记录，先复核原图响应再决定后续验收，不能直接重新生成或切换结果格式代替 URL 验收。

官方文生图接口说明了 URL/base64 结果形式和任务 ID，但本次核对公开文档索引与官方调用示例未找到明确的图片结果按 ID 取回入口，尚不能仅凭任务 ID 自动恢复该 URL。每个组合只发一次生成 POST，任何未知结果保留独占 journal 并停止，不自动重发或切换代理。既有原供应商未知请求与 MiniMax 19:26:41 的 `1033` 记录均保留，其计费结果不由新成功请求替代核对。

102 AC7 / 105 AC7 在取得正式产品证据前保持未完成；旧 B 的代理 PNG 三画幅、独立原生 JPEG 成功和本轮产品证据分别记录发布身份，不跨版本挪用成功 journal。历史记录见[供应商补验](provider-acceptance-follow-up.md)与[正式交付验收](public-delivery-verification.md)。
