# Local-first Cloudflare 部署

首次安装流程已统一到 `/admin/`，配置 Supabase 与管理员邮箱、密码，见[首次安装](../installation.md)。新安装可在向导提交账号服务配置，不再要求构建时提供公开 Key；下文构建变量仍兼容已部署站点。部署前设置 Worker secret `MEDIA_SETUP_TOKEN`，并应用 `011-installation.sql`。已存在管理员的站点必须由原管理员接入，不能再次自助提权。

更新：2026-11-06。真实 Angular 应用已经迁移到 CSR，默认运行不需要登录、业务 API 或云数据库；本站代理改为 Durable Object 任务，结果加密暂存 R2。正式发布与验收身份见[公网交付记录](../../requirements/plans/public-delivery-verification.md)。

## 部署结构

本次使用 **Workers Static Assets + 代理任务（SQLite Durable Object + 私有 R2）及可选产品 API**，通过同一域名部署：

```text
浏览器 ── GET 页面/JS/WASM ── Cloudflare Static Assets
  │
  ├── RxDB + OPFS：配置、凭据、代理任务令牌、草稿、最近 100 条任务、原图
  │
  ├── 默认供应商（代理）── /api/relay/tasks Worker ── RelayTask DO ── 允许列表内的供应商
  │                                                      └── 加密结果暂存 R2，结清即删
  │
  └── 主动选择直连 ── 支持浏览器 CORS 的供应商
```

已安装的旧版页面仍调用无状态的 `/api/relay`，该接口保持不变。

本机模式没有 SSR 或业务后端前置。可选账号、DTO 复制和业务后台依赖 Supabase；同源 Worker 的 `/api/admin/*`、`/api/templates` 与 `/api/provider-policies` 已接线并通过真实本地服务验收，生产项目另行配置。选择 Static Assets 是为了让静态资源与可选代理一次发布、保持同源，不需要额外域名或容器。默认免费供应商（`https://api.pengdevs.com`）对本站的 OPTIONS 预检返回 403，浏览器无法直连，因此默认走同源代理；用户只选择直连供应商时才绕过 Worker。账号/同步服务未配置时保持本机功能可用，不连接 Supabase。

## 免费资源约束

按 2026-10-23 官方文档，Workers Free 动态请求限 100,000 次/日，每次 10 ms CPU；静态资源请求不计入动态 Worker 请求费用。配置仅让 `/api/*` 先进入 Worker，普通静态请求走资产服务。Worker 不设置付费专属的 CPU 配置；代理代码自身限制请求体、响应体、固定上游路径和 180 秒超时。代理等待上游不等于 CPU 计算，但较大响应和平台限制仍可能导致请求失败，失败不自动重试。

发布不申请 Containers、D1、KV、自建 PostgreSQL 或付费计划；启用可选产品服务时只接已明确授权的 Supabase 项目，不自动创建或升级计划。脚本不会升级订阅；当前控制台已确认 Workers Free 为活动计划，账户其它产品与第三方模型费用不属于该免费计划证明。

代理任务使用 Workers Free 可用的 SQLite Durable Object 和 R2。按 2026-10 官方计价推算：DO 时长按墙钟时间乘以 128 MB 计费，免费额度每天 13,000 GB-s，一次 60 秒的生成约 7.5 GB-s，约 1,700 次/天；R2 需先在账号完成订阅流程，免费额度每月 10 GB-month、100 万次 A 类、1000 万次 B 类操作，删除免费，每次生成一次写入、一次读取。免费计划下 DO 单次调用的 CPU 上限文档未写明，服务端因此只做有界读取和加密，不解码图片；真实账号实测前不作为已验证结论。

产物检查限制静态文件不超过 20,000 个、单文件不超过 25 MiB。离线资源单文件另有限制 16 MiB，模型结果 PNG 限 16 MiB，代理 JSON 流限 24 MiB。

## 开发与构建

```sh
pnpm install --frozen-lockfile
pnpm nx run aiao-media:serve
pnpm nx run aiao-media:offline-assets
```

- `aiao-media:serve`：4300，启动 Angular 开发服务器，并由 `proxy.conf.mjs` 在同一进程内以随机本机端口（仅 127.0.0.1）运行同一份 Worker 的 `/api/relay` 与代理任务接口，允许列表取自 `../../apps/api/wrangler.json`，DO 与 R2 为 `apps/api/scripts/cloudflare-stand-ins.mjs` 的进程内替身；不启动 Supabase 和其它业务 API。关闭了依赖预构建（`prebundle: false`）：预构建从仓库根 `node_modules` 解析，找不到只链接在 `aiao-media/apps/web/node_modules` 的 `@aiao/*` 包；关闭后与生产构建一样按源文件位置解析。
- `aiao-media:build`：生产 CSR 编译到 `aiao-media/apps/web/dist/browser`。
- `aiao-media:offline-assets`：先 build，再写带摘要的离线壳和 Service Worker。
- `aiao-media:preview`：4398，使用 Wrangler 本地运行生产形态。
- `aiao-media:release-check`：检查凭据、文件数量/大小、旧 API 调用、SSR 残留及必需资源。
- `aiao-media:deploy-check`：以上检查完成后执行 Wrangler dry-run，不发布。
- `aiao-media:deploy`：以上检查完成后执行真实发布。

构建只读取公开账号配置，不读取服务端管理 Key 或供应商 Key。部署脚本只从进程环境或本机 `.env` 读取允许代理的 API 前缀，不向 Worker 上传旧服务端 Key。Wrangler 已固定为开发依赖，运行统一经 Nx 封装。

## 代理允许列表与凭据

可选变量 `AIAO_RELAY_PROVIDER_BASE_URLS` 是逗号分隔的 HTTPS API 前缀，例如：

```dotenv
AIAO_RELAY_PROVIDER_BASE_URLS=https://api.example.com/v1,https://images.example.org/v1
```

部署脚本优先读取进程环境，然后本机 `.env` 的该变量。变量不存在时，可使用已有 `AIAO_IMAGE_BASE_URL` 作为一个前缀；显式设为空字符串则禁用全部代理目标。`AIAO_IMAGE_API_KEY`、旧数据库凭据及登录信息不进入 Worker 或静态资源。

允许列表是精确的规范化 API 前缀；用户任意填写的 Base URL 不会自动获准。Worker 只允许同源浏览器（或已启用的桌面来源）提交、固定图片生成路径、单张图片及受限参数；无状态 `/api/relay` 与代理任务的接单共用同一套校验。Images API 使用 `/images/generations`，已适配的 MiniMax 官方前缀使用 `/image_generation`，不转发 Cookie 或其他请求头，拒绝重定向，响应 no-store。Key 仅放在本次上游 Authorization，不持久化、不打印敏感正文；生产 observability 日志已关闭。

代理任务（`PUT /api/relay/tasks/:id`）由页面生成任务标识与 32 字节任务令牌，令牌只存本机。RelayTask DO 只保存令牌摘要、请求指纹与状态，在接单调用内发出上游请求，同一标识重发不会再次调用上游；上游完整 JSON 用令牌派生的 AES-256-GCM 密钥加密后写入 `RELAY_RESULTS`，本站读不出内容。查询、取回、删除与放弃都必须带令牌，令牌错误与任务不存在返回相同的 404。任务结清后页面删除结果；无人取回的 24 小时后由 alarm 删除，bucket 的 1 天生命周期规则兜底。任务绑定缺失时接单在调用上游前返回 503，页面明确报错，不改走其他通道。接口、状态与安全边界见[实施计划](../../requirements/plans/relay-durable-tasks.md)。

MiniMax 当前只适配 `image-01`，官方 API 前缀为 `https://api.minimax.cn/v1`、`https://api.minimax.io/v1` 或 `https://api.minimaxi.com/v1`。模型和提示词在转发前检查，最多 1500 字符；三画幅使用明确的宽高，供应商结果仍须为原始 PNG，非 PNG 拒绝保存。代理任务向 MiniMax 请求 base64，避免暂存会过期的临时 URL。启用 MiniMax 代理仍须显式加入允许列表，不因应用支持适配器而自动获准。

返回 base64 时浏览器可直接校验并保存。返回 HTTPS 图片 URL 时，浏览器单独下载，绝不带上供应商 Key；该图片地址仍需允许 CORS。本代理首版只转发生成 API，不是任意图片 URL 下载代理。

`/api/provider-probe` 是无凭据诊断端点：对每个允许列表供应商做根路径 GET 与无 Key POST（任何 HTTP 响应都证明服务端可达，401 也视为可达），并把 OPTIONS 预检仅作为浏览器直连 CORS 的参考。`reachable` 仅表示 Worker 能收到供应商的 HTTP 响应，认证和图片生成仍需单独验证；`browserDirect` 表示该供应商支持浏览器直连。同时探测 example.com、cloudflare.com、api.openai.com 三个对照站点：若对照站点也全部失败，应先检查 fetch 错误信息，区分运行时参数错误与 Worker 出口网络问题，不能直接归因于供应商。错误会附上截断的 fetch 错误信息（不含凭据）。

Worker 出站请求必须使用 `redirect: 'manual'` 并检查非 2xx 响应，禁止跟随重定向携带 Key。Cloudflare Workers 不支持 `redirect: 'error'`，使用它会在发出网络请求前抛出 TypeError，导致所有供应商与公共对照站点均失败。

开发预览默认允许列表为空；需要本机验证代理时，可用部署脚本生成 `.wrangler/local-first/wrangler.deploy.json` 后，在同样的 Wrangler 本地运行参数中改用该配置。普通 CI 的代理测试使用 fixture，不连接真实收费供应商。

## 正式发布

当前按 [D-16](../../requirements/decisions.md#d-16统一使用平台-supabase) 发布统一平台 Supabase：用户在应用内注册或登录平台账号，再确认同步范围。部署前先完成独立平台项目的初始化或已审阅的前向迁移、Auth 站点/邮件配置、表 RLS、Realtime 与私有 `aiao-media-images` Storage；空项目初始化使用 `aiao-media:production-bundle`，已有项目不能重复执行空库包。步骤见[平台服务配置](platform-services.md)和[账号服务运维边界](../../requirements/plans/release-completion-tasks.md#后续正式账号服务的运维边界)。

浏览器的 `AIAO_SUPABASE_URL`、`AIAO_SUPABASE_ANON_KEY` 必须预先导出到构建进程，Worker secrets `MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY` 必须指向同一平台项目。只把 URL 和公开 publishable/anon Key 提供给前端；服务端凭据通过 Worker secrets 单独配置，不进入构建产物。当前流程保留公开账号配置，不再清空这两个变量。

```sh
# 仅首次或凭据失效时进行 Cloudflare 官方授权
pnpm --dir aiao-media/apps/web exec wrangler login

# 两个公开变量已从选定的平台项目导出到当前构建进程；不在文档或日志打印其值
: "${AIAO_SUPABASE_URL:?请配置平台项目 URL}"
: "${AIAO_SUPABASE_ANON_KEY:?请配置平台公开 Key}"
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false \
pnpm nx run aiao-media:deploy-check --skipRemoteCache
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false \
pnpm nx run aiao-media:deploy --skipRemoteCache
```

以上是当前发布流程，执行结果以真实构建、dry-run 和部署回执为准；本页修改不表示已经部署或通过生产账号/Storage 验收。

配置源为 `../../apps/api/wrangler.json`，名称 `aiao-media`。部署脚本在 Git 忽略的 `.wrangler/local-first` 中生成实际配置并调用固定版本 Wrangler。发布成功后，以 CLI 返回的真实 URL、version ID、deployment ID 为准，不能预先假定 workers.dev 子域名。

首次发布代理任务前，账号所有者先在 Cloudflare 控制台完成 R2 订阅流程，再创建私有 bucket 与生命周期规则（不开放公开访问）：

```sh
pnpm --dir aiao-media/apps/web exec wrangler r2 bucket create aiao-media-relay-results
pnpm --dir aiao-media/apps/web exec wrangler r2 bucket lifecycle add aiao-media-relay-results relay-results-1d --expire-days 1
```

`media-relay-v1` 迁移新增 `RelayTask` 类后，`wrangler rollback` 不能再回到加类之前的版本。因此分两次发布：第一次只带服务端（DO 类、R2 绑定与任务接口），前端仍是旧版本；用 `wrangler deployments status` 和任务接口确认可用后，第二次发布前端切换。前端出问题时回滚到第一次发布，两次发布之间没有类生命周期变化。发布不传 `--durable-objects-code-update-mode immediate`，默认 300 秒的代码更新延迟覆盖 180 秒上游超时。

如果已有同名 Worker，应先核对它确实属于本项目，再更新。首次账号/子域名设置由 Cloudflare 官方流程完成，不通过创建匿名临时账号代替正式上线。2026-10-25 20:25 正式发布 C，地址 `https://media.aiao.io`，版本 `caaf54dd-054b-4be8-a523-518c3875c7a9`；官方 100% 流量、四路由/CSP、46/46 离线资源和断网新文档启动已复核，生成 0 次。具体身份与烟测边界见[补验记录](../../requirements/plans/provider-acceptance-follow-up.md#正式发布-c-与公网烟测)。历史 B 的旧 API 404、真实供应商代理三画幅与官方更新/回退保留原证据。直连正方形结果未知，未重发，另两幅直连与跨 origin 原图 URL 尚未完成。具体发布摘要与各项证据边界见[公网交付记录](../../requirements/plans/public-delivery-verification.md)。

历史的本机模式发布曾清空两个公开账号变量并要求 `app-config.js` 为 `null`，该口径只适用于已记录的旧发布。当前平台发布保持 `NX_LOAD_DOT_ENV_FILES=false`，显式提供选定平台项目的公开配置，并核对 `dist/browser/app-config.js` 中的 URL/公开 Key 与 Worker secrets 所属项目一致；不能把本机回环配置带到线上。真实本地账号开发继续使用 `aiao-media:supabase-serve`，与正式项目分开。

产物审查记录在 `tmp/local-first/release.json`，包括源码 commit、工作区是否有未提交修改、每个产物的大小和 SHA-256；该记录不等于部署成功回执。

## 路由、缓存、CSP 和离线

- 四条页面 `/`、`/create`、`/images`、`/providers` 用 SPA fallback，直达与刷新均加载静态 shell。
- `assets.html_handling=none`：保留离线壳 `.html` 地址，避免默认 clean URL 重定向破坏资源完整性校验。
- `_headers` 限制脚本、WASM、框架、referrer 等；Angular 关闭 critical CSS 的内联事件处理器，实际浏览器验证 CSP。
- 首次联网缓存编译产物、模板、图片、编辑器动态模块、WASM 和离线壳；逐个核对摘要后才激活。
- Service Worker 只处理同源公开资源，不缓存 API、供应商请求、Key 或生成图片，不注册后台付费重试。
- 更新不执行 skipWaiting，不在用户编辑或生成过程中强制替换已安装版本。
- 离线只支持本机操作，不能调用远程模型。

## 验证

```sh
pnpm nx run-many -t lint typecheck -p aiao-media aiao-media-e2e
pnpm nx run aiao-media:test
pnpm nx run aiao-media:test-browser
pnpm nx run aiao-media:relay-test
pnpm nx run aiao-media-e2e:local-first-e2e
pnpm nx run aiao-media:requirements-check
pnpm nx run aiao-media:deploy-check
```

浏览器测试使用实际生产静态包、Chrome、RxDB、WASM、IndexedDB、OPFS 和 Service Worker；网络供应商使用 fixture。覆盖配置与草稿恢复、图片下载/回读、三种画幅、不确定请求、内存 Key、主动代理、四路由离线、备份恢复、移动布局、多标签页及本机写入失败。

正式发布后仍需记录：公网四路由和 WASM/CSP、发布回执与产物摘要、平台注册与真实邮件确认、两账号数据隔离，以及两设备草稿/作品/原图上传取回的原字节一致性。真实 Storage、续传与 Web/Tauri 验收不得由字节 fixture 替代；本地浏览器与账号套件顺序运行。正式 origin 的供应商 CORS、免费计划状态和真实生成/保存结果继续按各自范围验收。已经记录的本机 CORS 403 不能推导正式 origin 的结果。普通部署检查不调用真实模型；真实供应商验收走独立显式入口，持久记录每次尝试，遇到不确定结果停止，不自动重发。

## Pages 纯静态替代方案

`aiao-media/apps/web/dist/browser` 可独立上传到 Pages，保留 `_headers`；没有顶层 404.html 时使用 Pages 默认 SPA fallback。离线壳在 Pages 的 clean URL 规则下应重新验证，不能直接沿用 Worker 的 `html_handling` 配置。纯静态发布不提供同源 `/api/relay`，此时只使用直连；需要代理时应部署本方案的 Worker 或显式增加经过验证的独立通道。

## 回退与数据

保留已验证的静态产物和 Worker version ID，通过 Cloudflare 版本回退应用；新增 Durable Object 类之后，只能回退到同一类配置的版本（见上文分两次发布）。客户端 Service Worker 和 RxDB 不随服务器回退自动降级；禁止为回退清空本机库。正式域名应长期稳定，换 origin 时用户需先导出备份，再手动导入。JSON 备份不含 Key，恢复后重新配置凭据。

含 schema 守卫的应用在打开数据库前和每次操作前检查 `aiao-local-schema-<UUID>`；未知或更高版本阻止访问并保留文件。未来不兼容迁移必须在同一工作区锁内先提高 marker，再修改数据；不得删除或降低 marker 绕过检查。**不认识 marker 的旧产物不能作为安全回退目标**；本地守卫测试不代替正式版本/Service Worker 更新验收。详见[可靠性验收](../../requirements/plans/local-reliability-verification.md)。

旧账号工作区不会自动合并。本轮备份恢复采用新 UUID 工作区，原数据保留；不能据此宣称所有旧账号或更高 schema 版本均已完成迁移验证。

## 官方依据

- [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)
- [Static Assets 定价](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Static Assets 路由](https://developers.cloudflare.com/workers/static-assets/routing/advanced/)
- [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Pages SPA](https://developers.cloudflare.com/pages/configuration/serving-pages/)

当前移动真机验收暂缓；业务后台已通过真实本地服务与浏览器验收，见[后台计划](../../requirements/plans/business-admin.md)。正式项目迁移、Worker secrets、首管理员、域名和发布验收按[收尾清单](../../requirements/plans/release-completion-tasks.md)执行。服务端配置必须作为 Worker secrets 提供：`MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY`；普通 dashboard vars 不在版本配置中，后续 deploy 可能删除它们。公开构建使用同一项目的 `AIAO_SUPABASE_URL` 与 `AIAO_SUPABASE_ANON_KEY`，不能把本机回环地址发布为正式配置。
