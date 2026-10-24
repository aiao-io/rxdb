# Local-first Cloudflare 部署

更新：2026-10-23。真实 Angular 应用已经迁移到 CSR，默认运行不需要登录、业务 API 或云数据库。当前公网发布需要 Cloudflare 账号授权；没有正式 deployment ID 或公网验收结果时，不把构建或 dry-run 称为已上线。

## 部署结构

本次使用 **Workers Static Assets + 一个可选的无状态代理入口**，通过同一域名部署：

```text
浏览器 ── GET 页面/JS/WASM ── Cloudflare Static Assets
  │
  ├── RxDB + OPFS：配置、凭据、草稿、最近 100 条任务、原图
  │
  ├── 默认供应商（代理）── /api/relay Worker ── 允许列表内的供应商
  │
  └── 主动选择直连 ── 支持浏览器 CORS 的供应商
```

静态应用本身没有 SSR 或业务后端依赖。选择 Static Assets 是为了让静态资源与可选代理一次发布、保持同源，不需要额外域名或容器。默认免费供应商（`https://api.pengdevs.com`）对本站的 OPTIONS 预检返回 403，浏览器无法直连，因此默认走同源代理；用户只选择直连供应商时才绕过 Worker。未来 Supabase 同步不在本次部署中。

## 免费资源约束

按 2026-10-23 官方文档，Workers Free 动态请求限 100,000 次/日，每次 10 ms CPU；静态资源请求不计入动态 Worker 请求费用。配置仅让 `/api/*` 先进入 Worker，普通静态请求走资产服务。Worker 不设置付费专属的 CPU 配置；代理代码自身限制请求体、响应体、固定上游路径和 180 秒超时。代理等待上游不等于 CPU 计算，但较大响应和平台限制仍可能导致请求失败，失败不自动重试。

不申请 Containers、D1、R2、KV、Durable Objects、PostgreSQL、Supabase 或付费计划。脚本不会升级订阅；部署账号应使用 Workers Free，实际账号计划和账单仍须在账号内核对。免费静态托管不包含第三方模型费用。

产物检查限制静态文件不超过 20,000 个、单文件不超过 25 MiB。离线资源单文件另有限制 16 MiB，模型结果 PNG 限 16 MiB，代理 JSON 流限 24 MiB。

## 开发与构建

```sh
pnpm install --frozen-lockfile
pnpm nx run aiao-media:serve
pnpm nx run aiao-media:offline-assets
```

- `aiao-media:serve`：4300，只启动 Angular 开发服务器，不启动 API，不提供代理。
- `aiao-media:build`：生产 CSR 编译到 `apps/aiao-media/dist/browser`。
- `aiao-media:offline-assets`：先 build，再写带摘要的离线壳和 Service Worker。
- `aiao-media:preview`：4398，使用 Wrangler 本地运行生产形态。
- `aiao-media:release-check`：检查凭据、文件数量/大小、旧 API 调用、SSR 残留及必需资源。
- `aiao-media:deploy-check`：以上检查完成后执行 Wrangler dry-run，不发布。
- `aiao-media:deploy`：以上检查完成后执行真实发布。

构建不读取业务 Key。部署脚本只从进程环境或本机 `.env` 读取允许代理的 API 前缀，不向 Worker 上传旧服务端 Key。Wrangler 已固定为开发依赖，运行统一经 Nx 封装。

## 代理允许列表与凭据

可选变量 `AIAO_RELAY_PROVIDER_BASE_URLS` 是逗号分隔的 HTTPS API 前缀，例如：

```dotenv
AIAO_RELAY_PROVIDER_BASE_URLS=https://api.example.com/v1,https://images.example.org/v1
```

部署脚本优先读取进程环境，然后本机 `.env` 的该变量。变量不存在时，可使用已有 `AIAO_IMAGE_BASE_URL` 作为一个前缀；显式设为空字符串则禁用全部代理目标。`AIAO_IMAGE_API_KEY`、旧数据库凭据及登录信息不进入 Worker 或静态资源。

允许列表是精确的规范化 API 前缀；用户任意填写的 Base URL 不会自动获准。Worker 只允许同源浏览器 POST、固定 `/images/generations`、单张图片及受限参数，不转发 Cookie 或其他请求头，拒绝重定向，响应 no-store。Key 仅放在本次上游 Authorization，不持久化、不打印敏感正文；生产 observability 日志已关闭。

返回 base64 时浏览器可直接校验并保存。返回 HTTPS 图片 URL 时，浏览器单独下载，绝不带上供应商 Key；该图片地址仍需允许 CORS。本代理首版只转发生成 API，不是任意图片 URL 下载代理。

`/api/provider-probe` 是无凭据诊断端点：对每个允许列表供应商做根路径 GET 与无 Key POST（任何 HTTP 响应都证明服务端可达，401 也视为可达），并把 OPTIONS 预检仅作为浏览器直连 CORS 的参考。`reachable` 仅表示 Worker 能收到供应商的 HTTP 响应，认证和图片生成仍需单独验证；`browserDirect` 表示该供应商支持浏览器直连。同时探测 example.com、cloudflare.com、api.openai.com 三个对照站点：若对照站点也全部失败，应先检查 fetch 错误信息，区分运行时参数错误与 Worker 出口网络问题，不能直接归因于供应商。错误会附上截断的 fetch 错误信息（不含凭据）。

Worker 出站请求必须使用 `redirect: 'manual'` 并检查非 2xx 响应，禁止跟随重定向携带 Key。Cloudflare Workers 不支持 `redirect: 'error'`，使用它会在发出网络请求前抛出 TypeError，导致所有供应商与公共对照站点均失败。

开发预览默认允许列表为空；需要本机验证代理时，可用部署脚本生成 `.wrangler/local-first/wrangler.deploy.json` 后，在同样的 Wrangler 本地运行参数中改用该配置。普通 CI 的代理测试使用 fixture，不连接真实收费供应商。

## 正式发布

```sh
# 仅首次或凭据失效时进行 Cloudflare 官方授权
pnpm --dir apps/aiao-media exec wrangler login

# 账号已授权后，构建、审查并发布
pnpm nx run aiao-media:deploy
```

配置源为 `deploy/wrangler.json`，名称 `aiao-media`。部署脚本在 Git 忽略的 `.wrangler/local-first` 中生成实际配置并调用固定版本 Wrangler。发布成功后，以 CLI 返回的真实 URL、version ID、deployment ID 为准，不能预先假定 workers.dev 子域名。

如果已有同名 Worker，应先核对它确实属于本项目，再更新。首次账号/子域名设置由 Cloudflare 官方流程完成，不通过创建匿名临时账号代替正式上线。当前正式发布地址为 `https://aiao-media.aiao.workers.dev`，版本 `92883918-76ac-47de-a424-4bc5af23bee9`；已验证四路由、WASM、旧 API 404 和公网页面加载。正式目标域名确定为 `media.aiao.io`，`deploy/wrangler.json` 已配置 `routes: [{ pattern: "media.aiao.io", custom_domain: true }]`；真实部署才会绑定域名和证书，需在本机已登录账号拥有的 active Cloudflare zone 内操作，不能覆盖未知 CNAME。该 origin 的四路由、WASM、CSP、Service Worker 与供应商 CORS 仍需分别验收。

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
pnpm nx run-many -t lint typecheck -p aiao-media local-data web-e2e
pnpm nx run-many -t test -p local-data web
pnpm nx run aiao-media:relay-test
pnpm nx run aiao-media-e2e:local-first-e2e
pnpm nx run aiao-media:requirements-check
pnpm nx run aiao-media:deploy-check
```

浏览器测试使用实际生产静态包、Chrome、RxDB、WASM、IndexedDB、OPFS 和 Service Worker；网络供应商使用 fixture。覆盖配置与草稿恢复、图片下载/回读、三种画幅、不确定请求、内存 Key、主动代理、四路由离线、备份恢复、移动布局、多标签页及本机写入失败。

正式发布后仍需记录：公网四路由和 WASM/CSP、正式 origin 的供应商 CORS、免费计划状态，以及真实供应商的生成/保存结果。已经记录的本机 CORS 403 不能推导正式 origin 的结果。不会为部署检查自动调用真实模型或反复尝试收费请求。

## Pages 纯静态替代方案

`apps/aiao-media/dist/browser` 可独立上传到 Pages，保留 `_headers`；没有顶层 404.html 时使用 Pages 默认 SPA fallback。离线壳在 Pages 的 clean URL 规则下应重新验证，不能直接沿用 Worker 的 `html_handling` 配置。纯静态发布不提供同源 `/api/relay`，此时只使用直连；需要代理时应部署本方案的 Worker 或显式增加经过验证的独立通道。

## 回退与数据

保留已验证的静态产物和 Worker version ID，通过 Cloudflare 版本回退应用。客户端 Service Worker 和 RxDB 不随服务器回退自动降级；禁止为回退清空本机库。正式域名应长期稳定，换 origin 时用户需先导出备份，再手动导入。JSON 备份不含 Key，恢复后重新配置凭据。

含 schema 守卫的应用在打开数据库前和每次操作前检查 `aiao-local-schema-<UUID>`；未知或更高版本阻止访问并保留文件。未来不兼容迁移必须在同一工作区锁内先提高 marker，再修改数据；不得删除或降低 marker 绕过检查。**不认识 marker 的旧产物不能作为安全回退目标**；本地守卫测试不代替正式版本/Service Worker 更新验收。详见[可靠性验收](../requirements/plans/local-reliability-verification.md)。

旧账号工作区不会自动合并。本轮备份恢复采用新 UUID 工作区，原数据保留；不能据此宣称所有旧账号或更高 schema 版本均已完成迁移验证。

## 官方依据

- [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)
- [Static Assets 定价](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Static Assets 路由](https://developers.cloudflare.com/workers/static-assets/routing/advanced/)
- [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Pages SPA](https://developers.cloudflare.com/pages/configuration/serving-pages/)

当前移动真机验收暂缓；业务后台将以独立服务端权限接入同源 Worker，尚未实现，见[后台计划](../requirements/plans/business-admin.md)。当前静态/代理能力不代表后台已接通。
