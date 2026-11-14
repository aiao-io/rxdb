# 2026-11-06 平台 Supabase 正式发布与验收

本次按 [D-16](../decisions.md#d-16统一使用平台-supabase) 在正式域名启用统一平台账号和同步。以下依据部署回执、项目初始化核验、真实云 API smoke 与当前线上界面结果记录；故事状态仍以 YAML 和未完成 AC 为准，不因部署成功标为 Done。

## 发布身份

| 项目                          | 实际记录                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| 正式 origin                   | `https://media.aiao.io`                                                 |
| Worker                        | `aiao-media`                                                            |
| 平台首发 Worker version       | `cf252547-dd7c-4b0b-8b77-9e1de257ab4b`                                  |
| 旧配置缓存修复 Worker version | `fb9c2e12-c181-4ded-ba65-c13fd0a0585b`                                  |
| 当前 Worker version           | `36d61b6b-fd39-4a99-94b8-80afa0c05063`                                  |
| 当前 Deployment               | `95c035ab-f69d-43b7-a59b-fc9b17f81e5e`                                  |
| 当前版本流量                  | 100%                                                                    |
| 当前发布时间                  | 2026-11-06 22:07:31（Asia/Shanghai；UTC `2026-11-06T14:07:31.586246Z`） |
| 平台首发时间                  | 2026-11-06 16:12:14（Asia/Shanghai；UTC `2026-11-06T08:12:14Z`）        |
| 缓存修复发布时间              | 2026-11-06 16:41:57（Asia/Shanghai；UTC `2026-11-06T08:41:57.118Z`）    |
| 平台 Supabase 项目名称        | `media`                                                                 |
| 产品 schema marker            | 10                                                                      |
| 13 源 bootstrap SHA-256       | `750516b353fe155c97d1276f3a56a5ee1c69fa0c6c7f681ec43c0643a3f24809`      |

初始化前已核验选定项目的 public schema 无关系/函数、Auth 用户数为 0、Storage bucket 数为 0，然后执行审阅后的 13 源生产 bootstrap。此记录只证明本次空库初始化，不授权把该包重复用于已有产品数据或其他共享项目。

Auth 正式 Site URL 和允许的返回地址已设置，邮箱确认保持开启。三个 `MEDIA_SUPABASE_*` Worker secrets 已配置，浏览器公开账号配置与 Worker 使用同一平台项目；记录不包含 Key、会话、邮箱或其他凭据。

## 真实云 API 验证

使用两个普通账号及同账号的第二个会话验证，未通过管理员身份代替用户权限：

- 元数据写入与另一会话读取通过，修订推进和 tombstone 传播通过。
- 元数据与同步日志的账号隔离通过；其他账号无法读取不属于自己的记录。
- 私有 Storage 样本上传、下载通过，回读 SHA-256 与上传原字节一致；账号 B 与匿名请求访问被拒绝。
- 本次临时测试账号、记录和对象已清理；未保留凭据或用户私有正文到报告。

这是实际云 Auth、数据库和 Storage 证据，与前序本地字节 fixture 分开统计。它不覆盖所有图片格式、超过 6 MiB 的续传、持久队列、全部删除冲突或 Tauri 原生落盘。

## 正式域名 UI 进展

已在 `https://media.aiao.io` 完成真实云 Auth、数据库和 Storage 的完整浏览器同步验收：

- 注册表单存在且字段符合平台账号流程；本次未发送注册邮件，不能证明公众注册邮件闭环。
- 平台登录、确认范围后元数据同步和真实原图上传通过。
- 同账号第二设备恢复草稿，默认关闭原图上传，通过显式下载取回真实原图；下载字节与原 PNG 的 SHA-256 完全一致。
- 生图上游单独使用本地 fixture，未调用收费服务；账号、数据库和 Storage 请求均连接正式云服务。

验收结束后清理了临时账号和对象，查询时测试用户数及 Storage 对象数均为 0。上述 Web 样本不关闭全部生产 Web/Tauri 全链路 AC；前序本地测试与覆盖率见[验收记录](../verification-report.md#2026-11-06-平台统一同步验证)。

公开 HTTP 检查确认 `/providers` 为 200 且 CSP 允许平台项目的 `wss`，公开 app-config 已启用并与 Worker 使用同项目公开 Key，`/api/templates` 为 200，旧 `/api/supabase/oauth/start` 为 404。线上 `offline-manifest.json` 与本地产物字节一致，SHA-256 为 `b525ef084aad4e7ea68a1975333a5203c8b608e38da65b26715f4f26397dba56`。

平台首发版本的公开四路由与离线缓存浏览器 smoke 两次遇到网络超时：首次在 `online-routes` 阶段，已确认 `/`、`/create`、`/images` 为 200 且 CSP 符合预期，`/providers` 浏览器阶段未完成；该次网络 unsafe、页面错误、写操作与生成调用计数均为 0。复跑在 `public-artifacts` 阶段 30.4 秒超时，回执位于 `aiao-media/apps/web-e2e/tmp/public-origin-smoke/1793953292523-cf252547-dd7c-4b0b-8b77-9e1de257ab4b.json`。该版本的浏览器四路由与离线缓存验收当时未完成，超时原因尚未确定；晚间发布的真实浏览器复验结果见下文。核心线上 Auth/数据库/Storage 同步全链路通过的结果保持有效。

**旧缓存回归已通过本地真实浏览器验证，修复已发布，正式站点表单复验通过。** 用户反馈“平台账号服务暂不可用”，已定位为旧 Service Worker 对 `/app-config.js` 采用缓存优先并保留了账号配置为 `null` 的旧文件，而导航采用网络优先取得新 HTML，导致新界面读取旧配置；此反馈的原因不是实际 Supabase 健康故障。修复使生产 HTML 引用 `app-config-<内容 SHA-256 前 16 位>.js`，离线 manifest 缓存该内容哈希文件，并保留稳定文件名用于独立验收。

`platform-account-update-fixture --excludeTaskDependencies` 在真实浏览器中通过（22.2 秒）：旧版 stable-null Service Worker 保持 active、保活旧页未关闭时，重载的新页从网络取得新版内容哈希配置，平台注册表单立即可用；profile、schema、草稿及原图字节保持一致。关闭全部旧页后，新版变为 active，`waiting=null`、旧版 `clients=[]`；离线新开页时配置哈希一致、注册表单仍可打开、本机原图可读取，远端请求数为 0，未执行离线注册。此项使用本地产物与 fixture，不冒充正式域名或真实公众注册邮件验收。

`auth-config-test` 3/3、脚本 lint、`deploy-check` 与 `release-check` 均通过。修复发布回执为 Worker version `fb9c2e12-c181-4ded-ba65-c13fd0a0585b`，2026-11-06 16:41:57（Asia/Shanghai）发布，部署状态核验为 100% 流量；配置路径 `/app-config-b29867111480b71c.js` 已纳入离线 manifest，新 `offline-manifest.json` SHA-256 为 `53289d69f6cbe7ac101c9d57eed6a8b5d1da9d607be762ee5a58a95fe5060d67`。

正式站点 `/providers#sync` 复验通过：引用新的内容哈希配置，`platformAvailable=true`，“平台账号服务暂不可用”提示消失，注册表单可见。本次未提交注册，也未发送邮件；不扩大为公众注册闭环证据。上述首发版本公开 smoke 的两次网络超时记录保留。

## 晚间 Cloudflare 发布复验

2026-11-06 22:07:31（Asia/Shanghai）按现有 Workers Static Assets、SQLite Durable Object 与私有 R2 配置发布。Cloudflare 官方部署状态确认新版本接收 100% 流量；源码为 `c7ca633e86e17a0d3183ecd5a0ce99dca25c5498`，构建及发布检查时工作区干净。发布前版本为 `ebf208fd-31ff-40b5-b584-125749a00622`，Deployment 为 `f33ec46f-c34e-4fcf-b051-3abfcc2ace68`。

构建显式使用发布前正式站点已验证的公开平台配置，并设置 `NX_NO_CLOUD=true`、`NX_LOAD_DOT_ENV_FILES=false`。本机 `.env` 的账号配置指向测试服务；本次公开配置在构建与上线后均核对一致，三个生产 Worker secrets 与既有 R2 bucket 已核验存在。部署记录不包含凭据值。

发布前 `lint`、`typecheck`、964 项应用单元测试、45 项真实浏览器测试、61 项脚本测试、17 项需求检查测试、12 项平台测试和 4 项公网烟测契约测试通过。`release-check` 检查 66 个产物文件，凭据扫描与 Wrangler dry-run 通过。

构建首屏原始体积为 589.64 kB，预计传输 148.94 kB，超过 510 kB 预警阈值，低于 1 MB 阻断阈值；该性能告警保留待处理。

正式 HTTP 复验确认四路由、WASM、公开账号配置、`/api/templates` 与 `/api/provider-policies` 均返回 200，CSP 包含平台 Realtime origin。线上与本地 `offline-manifest.json` 字节一致，SHA-256 为 `efa8498f526f8c864fb7a649ef478837a2cb0eb977b6426a7f14fd626bdc458b`，离线版本为 `eeda82420b951db156b31c69a1e55998ff6de1e8c4d981234641d844f0fa09fd`。

`aiao-media-e2e:public-origin-smoke` 在正式站点真实浏览器中通过，验证时间为 22:09:12–22:09:31（Asia/Shanghai）：

- `/`、`/create`、`/images`、`/providers` 直达及页面加载均为 200，CSP 和公开平台配置匹配。
- 草稿刷新后保持；58/58 离线资源摘要匹配，Service Worker 已激活，单一缓存版本且无 waiting worker。
- 浏览器断网后新开四路由均由 Service Worker 返回 200，本机 profile 与草稿保持；未缓存网络请求确实失败。
- 页面错误、越界网络、生成调用和远端写操作均为 0。

本机回执为 `aiao-media/apps/web-e2e/tmp/public-origin-smoke/1793974171005-36d61b6b-fd39-4a99-94b8-80afa0c05063.json`，`fixture=false`、`passed=true`。部署、HTTP 与发布前检查证据位于 Git 忽略的 `aiao-media/apps/web/tmp/cloudflare-release-20261106/`。这次烟测覆盖同一隔离浏览器上下文中的新页面离线启动；公众邮件注册、生产账号同步、真实生图、升级和回退继续按各自独立验收证据统计。

## 公众注册与剩余边界

**尚未配置自定义 SMTP。Supabase 默认邮件服务仅向项目团队成员发送邮件，普通公众邮箱的注册与确认邮件闭环尚未验证，也尚未具备完整的公众注册交付条件。** 云 API 使用的临时普通账号和线上登录/同步通过，不能替代公众自行注册和收到验证邮件的证据。

后续仍需完成：自定义 SMTP 与公众邮箱注册/确认邮件；首屏包体积告警；大图续传、失败恢复和删除冲突；macOS Tauri 与 Web 的真实跨设备原图与离线恢复验收。生产管理后台、模型与计费按各自故事验收，本次同步部署不扩大其通过范围。
