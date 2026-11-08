# Aiao Images

Local-first 图片创作应用：发现灵感 → Tiptap 编辑提示词 → 使用自己的供应商生成 → 本机保存、下载和备份。

默认 Angular 入口已切换到本地版本，无需登录、业务 API、PostgreSQL 或 Supabase。应用数据使用 RxDB / SQLite / IndexedDB，原图使用 storage plugin / OPFS；可选 Supabase 注册/登录和会话恢复已实现；账号绑定、原生 RxDB 多副本同步和业务后台已在真实本地服务接线验证。旧账号命名空间保留，不会自动删除或合并。当前优先桌面能力与跨用户业务后台，移动端验收暂缓；绑定和后台方案见[实施计划](../../requirements/plans/README.md)。

迁入来源与兼容验证见[迁移验收](../../requirements/plans/rxdb-import-verification.md)。应用需求在本目录内独立维护，平台需求仍位于仓库根。

当前平台免费，平台图片服务、积分购买和计费后台已移除，`/api/platform/*` 返回 404；未来提供收费功能时再评审。桌面安装版与统一平台账号同步的实现及未验边界见[产品交付计划](../../requirements/plans/product-completion-20261030.md)。本地安装说明见 [Tauri](src-tauri/README.md)，平台配置见[服务部署](deploy/platform-services.md)。

## 运行

需要 Node.js >=26 和 pnpm >=10（版本见仓库 `.nvmrc` 与根 `package.json`），以及支持 OPFS、Web Locks、WASM 的现代浏览器；使用本地 Supabase 另需 Docker（Compose v2）。前端不需要 `.env` 或数据库。首次或依赖变化后先安装：

```sh
pnpm install --frozen-lockfile
```

本机创作不需要安装数据库：前端是 Angular CSR，后端是同一份 [Cloudflare Worker](../api/src/local-first-worker.ts)。生图代理 `/api/relay`、`/api/relay/tasks` 不依赖账号；`/api/admin`、`/api/templates` 及账号同步使用部署方统一的 Supabase 项目。本地有两种形态：开发服务器带热更新，并把代理部分内嵌在同一进程里，不必另起后端；Wrangler 预览在本机运行完整 Worker 和构建后的静态产物，没有热更新。

下表命令省略 `pnpm nx run aiao-media:` 前缀，`supabase-local.mjs preview` 是直接用 node 运行的脚本。两行 Supabase 的完整步骤见[可选账号与本地 Supabase](#可选账号与本地-supabase)。

| 场景                    | 命令                                              | 地址                    | 前端                               | 后端                             |
| ----------------------- | ------------------------------------------------- | ----------------------- | ---------------------------------- | -------------------------------- |
| 无 Supabase，开发       | `serve`                                           | `http://localhost:4300` | 开发服务器，热更新                 | 内嵌的生图代理                   |
| 无 Supabase，生产形态   | `offline-assets` → `preview`                      | `http://localhost:4398` | 构建后的静态产物                   | Wrangler 本地运行完整 Worker     |
| 本地 Supabase，开发     | `supabase-migrate` → `supabase-serve`             | `http://localhost:4300` | 开发服务器，热更新                 | 内嵌的生图代理 + Docker Supabase |
| 本地 Supabase，生产形态 | `supabase-migrate` → `supabase-local.mjs preview` | `http://127.0.0.1:4399` | 构建后的静态产物，注入本地账号配置 | 完整 Worker + Docker Supabase    |

### 无 Supabase：开发服务器

```sh
pnpm nx run aiao-media:serve
```

打开 `http://localhost:4300`，四个页面分别为 `/`、`/create`、`/images`、`/providers`。首次打开时会自动创建并选中当前免费的默认供应商；如果本机还没有 API Key，生成时会在创作页直接请你填写。也可以在设置页的「供应商」分区覆盖默认项，填写自己的名称、HTTPS Base URL、图片模型 ID 和 API Key。Base URL 填 API 前缀：Images API 追加 `/images/generations`，MiniMax 官方前缀追加 `/image_generation`。

- 前端是 Angular 开发服务器，改源码自动刷新。首次运行会先构建依赖包和 wasm 资源，之后命中缓存。
- 后端是 [proxy.conf.mjs](proxy.conf.mjs) 在同一进程内启动的 Worker 代理，只提供 `/api/relay` 和 `/api/relay/tasks`（详见下文「本站代理」）；不启动 Supabase，也没有 `/api/admin`、`/api/templates`。
- 数据保存在浏览器的 OPFS / IndexedDB，不需要数据库或 `.env`。
- 开发构建自动接入 RxDB DevTools 浏览器扩展，检查当前工作区的媒体数据库；切换工作区时连接随之切换。生产和桌面构建使用空实现，产物不包含 `@aiao/rxdb-devtools`。
- 未配置 `AIAO_SUPABASE_URL` 和 `AIAO_SUPABASE_ANON_KEY` 时不显示注册/登录入口。如果 `aiao-media/apps/web/.env` 里填过这两项，入口会出现；要纯本机模式就清空它们。

### 无 Supabase：生产形态预览

```sh
pnpm nx run aiao-media:offline-assets   # 构建 dist/browser，并生成离线壳和 Service Worker
pnpm nx run aiao-media:preview          # Wrangler 本地运行，不需要登录 Cloudflare
```

打开 `http://localhost:4398`。`preview` 不会自己构建，改了前端要重新执行 `offline-assets` 再重启。用来验证完整 Worker（Durable Object 与 R2 由 Wrangler 本地模拟）、Service Worker 离线、CSP 和 `/api/provider-probe`。

Wrangler 会自动读取被 Git 忽略的 `deploy/.dev.vars`（Worker 私有配置，模板见 [.dev.vars.example](deploy/.dev.vars.example)）。文件不存在时，依赖 Supabase 的接口不可用（返回 503 或空列表），本机创作不受影响；文件存在时，Worker 会带着其中的 Supabase 配置运行，要纯本机预览先把它移走。已有平台模型或支付配置不会重新开放已停用的接口。

### 供应商与生成

当前适配器支持单张 PNG/JPEG 原图，按实际字节识别格式并原样保存、下载。Images API 使用 `n=1`、`quality=low`、`output_format=png`；MiniMax 官方前缀使用 `image-01`、`response_format=url`，关闭提示词优化。三个请求尺寸为 1024×1024、1536×1024、1024×1536；供应商必须支持对应参数。真实供应商验收可使用忽略的本地 `.env`，字段见 [`.env.example`](.env.example)；本次验收额度不限，Key 不进入发布产物。

模型 ID 使用 1–128 位英数字、点、下划线、冒号或短横线。支持读取 `b64_json` 或允许跨域读取的 HTTPS 图片 URL，不代表兼容所有图片 API。

- **浏览器直连，自建配置默认**：Key 和提示词直接发给供应商，本站不接收。供应商 API 和结果图片均须支持 CORS。
- **本站代理，明确选择或预设声明**：每次生成是本站 Worker 上的一个任务（`/api/relay/tasks`），仅允许运营配置的供应商前缀。Key 只在接单时用于向供应商发出这一次请求，不写入任何存储；生成中可以刷新或关闭页面，回来后会接着取回结果，不会重复生成。供应商返回的结果用只保存在本机的任务令牌加密后暂存在私有 R2，本站读不出内容；取回保存后立即删除，无人取回的 24 小时后删除，R2 生命周期规则 1 天兜底，最长约 48 小时。开发服务器（`aiao-media:serve`）在同一进程内以本机随机端口运行同一份 Worker 的代理与任务接口（仅监听 127.0.0.1，允许列表取自 `../api/wrangler.json`，DO/R2 为进程内替身）；生产形态预览使用 `aiao-media:preview`。已安装的旧版页面继续使用无状态的 `/api/relay`。
- 默认 Key 只保留在当前页面内存。勾选“在此设备记住 Key”后，写入本机专门的凭据记录；配置、任务记录和备份不包含凭据，代理任务令牌也单独存放，不进任务记录、备份或同步。
- 请求发送前先写本机任务记录。直连请求在超时、CORS、断网或刷新后结果不确定时不自动重发、不自动切换代理；代理任务在刷新后继续，只有本站确认上游结果不确定时才进入核对。用户核对供应商记录后才能解除锁定。

首次联网完成离线资源安装后，四个页面及本机草稿、配置、作品可离线打开。模型生成始终需要联网，自有供应商调用费用按该供应商的规则承担。

## 本机数据和备份

设置页的「本机数据」分区提供存储配额提示、持久存储申请、完整 JSON 备份导出/导入。备份包含原图、SHA-256 摘要、提示词草稿、供应商配置和最近 100 条任务记录，固定排除 API Key，单个文件最多 64 MiB。

导入先验证格式、版本、图片摘要、尺寸和可解码性，再写入独立工作区；全部成功后才切换。原工作区保留，失败不会覆盖它，相同备份中断后重新导入可继续写入暂存工作区。原工作区 ID 保存在 `aiao-local-previous-profile-v1`，不自动合并。请定期下载重要图片和备份；清除浏览器站点数据会清除全部本机工作区。

## 可选账号与本地 Supabase

本机创作无需账号配置。部署方为统一平台项目设置 `AIAO_SUPABASE_URL` 和公开 `AIAO_SUPABASE_ANON_KEY` 后重新构建，才显示注册/登录入口；禁止使用 service role 或 secret Key。用户只需注册平台账号并登录，无需自建 Supabase 项目或填写项目配置。登录本身不绑定、不上传；开启同步后同步草稿、供应商公开配置和作品信息，确认原图范围后可同步已保存的 PNG/JPEG。API Key、本机路径和文件句柄固定排除。后台私有配置、可信管理员初始化和验收边界见[本地产品交付验收](../../requirements/plans/local-delivery-verification.md)。

### 启动本地 Supabase

本机调试和真实服务验收用 Docker Compose 运行本地服务（[docker-compose.yml](infra/supabase/docker-compose.yml)）：Postgres、Auth、PostgREST、Realtime、Kong 网关和 Inbucket 邮箱，只监听 127.0.0.1。开发凭据在首次启动时生成到被 Git 忽略的 `infra/supabase/.env`，已存在则沿用；端口也在该文件里改。

| 默认端口 | 服务                                             |
| -------- | ------------------------------------------------ |
| 54321    | API 网关（Kong），即前端用的 `AIAO_SUPABASE_URL` |
| 54322    | Postgres                                         |
| 54323    | Studio，仅 `supabase-studio` 启动                |
| 54324    | Inbucket 邮箱，注册确认邮件在这里收              |

先在终端里设置环境变量，之后的命令都在同一个终端执行：

```sh
# 每个检出位用不同的名字，之后每次启动沿用同一个
export COMPOSE_PROJECT_NAME=aiao-media-dev
# 沿用验收文档的做法：不让应用 .env 里的公网配置干扰，也不把带本地 Key 的构建写进 Nx Cloud 缓存
export NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false
```

Compose 文件的默认项目名是 `aiao-media-supabase`，所有检出位共用同名数据卷，而每个检出位的 `infra/supabase/.env` 密码各自随机，复用别处遗留的卷会出现数据库密码对不上。`COMPOSE_PROJECT_NAME` 让每个检出位使用独立的卷；`supabase-down`、`supabase-status`、`supabase-logs` 也要在同一个名字下执行，否则操作的是默认项目。

起栈并迁移，首次要拉取镜像：

```sh
pnpm nx run aiao-media:supabase-migrate
```

`supabase-migrate` 依赖 `supabase-up`：生成凭据和 Kong 配置、拉取镜像并 `docker compose up -d --wait`，再把仓库根 `docker/sql` 的核心 SQL 与 `infra/supabase/migrations/*.sql`（同步表、RLS、后台、图片存储）执行进数据库。依赖它的验收目标每次都会先跑一遍，所以可以重复执行。`supabase-serve` 只起栈、不迁移，因此先跑这一步。

### 有 Supabase：开发服务器

```sh
pnpm nx run aiao-media:supabase-serve
```

先执行 `supabase-up`，再把 `AIAO_SUPABASE_URL=http://127.0.0.1:54321` 和本地公开 anon Key 注入后启动 `serve`。打开 `http://localhost:4300`，注册/登录入口出现。后端仍是内嵌的生图代理，不提供 `/api/admin`、`/api/templates`；需要业务后台与模板接口时用下面的生产形态预览。

### 有 Supabase：生产形态预览

```sh
cp -p aiao-media/apps/web/deploy/.dev.vars /tmp/aiao-dev.vars.bak   # 已有该文件时先备份
node aiao-media/apps/web/scripts/supabase-local.mjs preview
```

这是前台进程（Ctrl-C 停止），不是 Nx 目标，在仓库根目录执行，要求本地栈已启动并迁移。[supabase-local.mjs](scripts/supabase-local.mjs) 依次：写入 `deploy/.dev.vars`（本地 URL、anon Key 和 service role Key，权限 0600，仅供 Worker 使用）→ 用本地公开配置构建 `offline-assets` → 用 Wrangler 在 4399 端口运行完整 Worker 与静态产物。没有热更新，改了前端要停掉重新运行。

- 地址必须用 `http://127.0.0.1:4399`，不能用 `localhost`。本地 Auth 与 Kong 的来源白名单写死为 `http://localhost:4300`、`http://127.0.0.1:4300`、`http://127.0.0.1:4399`（[docker-compose.yml](infra/supabase/docker-compose.yml)、[kong.template.yml](infra/supabase/kong.template.yml)），所以 4398 的 `preview` 连不上本地 Docker Supabase。
- **会整体覆盖 `deploy/.dev.vars`，只剩上面 3 个键**，已有的 Stripe 等配置会丢。用完还原：`cp -p /tmp/aiao-dev.vars.bak aiao-media/apps/web/deploy/.dev.vars`。`supabase-e2e` 与 `aiao-media-e2e:product-e2e` 也会启动这个预览，同样覆盖。

### 注册、同步和后台

1. 点账号入口注册。本地 Auth 不自动确认邮箱，到 `http://127.0.0.1:54324`（Inbucket）收信并点确认链接，再登录。
2. 登录不会自动上传。在账号窗口里点「启用同步」后，才同步草稿、供应商公开配置和作品信息；API Key 留在本机，原图需单独确认才上传。设置页的「同步」分区（`/providers#sync`）只提供平台账号入口；另一设备使用同一账号即可继续同步。
3. 首个管理员用 `pnpm nx run aiao-media:admin-membership --user-id=<Auth 用户 UUID> --state=enabled` 授权（UUID 在 Studio 的 `auth.users` 表里取），之后访问 `/admin`。后台接口在 Worker 里，只有生产形态预览提供。

### 验收、状态和停止

```sh
# 状态与日志（在同一个 COMPOSE_PROJECT_NAME 下）
pnpm nx run aiao-media:supabase-status
pnpm nx run aiao-media:supabase-logs
# 额外启动 Studio：http://127.0.0.1:54323
pnpm nx run aiao-media:supabase-studio
# 真实邮箱确认、RLS/Realtime 和会话刷新/退出探针
pnpm nx run aiao-media:supabase-test
# 真实 Chrome 注册/登录/恢复/退出与断网恢复
pnpm nx run aiao-media:supabase-e2e
# 停止服务并保留数据库卷
pnpm nx run aiao-media:supabase-down
```

真实账号浏览器套件使用独立的 4399 端口，先构建生产静态应用；常规本机套件使用 4398 端口和 Auth fixture。两套浏览器验收按顺序运行。范围和隔离说明见[账号验收说明](../../requirements/plans/supabase-account-verification.md)。

常见问题：

- 数据库认证失败，或 `supabase-up` 因服务不健康而超时：常见原因是数据卷与 `infra/supabase/.env` 的密码不匹配，`supabase-logs` 可确认。换一个 `COMPOSE_PROJECT_NAME` 即得到全新的卷；确需清空该项目的本地数据时，先 `supabase-down`，再 `docker volume rm ${COMPOSE_PROJECT_NAME}_db-data ${COMPOSE_PROJECT_NAME}_db-config`。
- 端口被占用：改 `infra/supabase/.env` 里的 `API_PORT`、`DB_PORT`、`STUDIO_PORT`、`MAIL_PORT`（四个互不相同，范围 1024–65535），前端用的地址随 `API_PORT` 变化。

### 配置统一平台 Supabase

- 整站使用部署方的同一个项目：构建时注入公开配置，只填项目 URL 和 anon / publishable Key，禁止 service role 或 secret Key。例如 `AIAO_SUPABASE_URL=https://<ref>.supabase.co AIAO_SUPABASE_ANON_KEY=<anon Key> pnpm nx run aiao-media:serve`，也可以写进本机 `.env`（变量见 [.env.example](.env.example)）。Worker secrets 必须指向同一项目，见[平台服务配置](deploy/platform-services.md)。
- 部署方一次初始化云项目：`pnpm nx run aiao-media:production-bundle` 生成 `tmp/production-supabase-bundle.sql`，由项目所有者审阅后在空项目的 SQL Editor 执行。已有项目逐个审阅前向迁移，不要重复运行空库初始化包。数据库与私有 `aiao-media-images` Storage bucket 均按账号和工作区执行访问控制。
- 用户只注册、登录平台账号并确认同步范围，无需 Supabase 管理账号、项目配置或数据库操作。另一台设备使用同一平台账号，即可同步草稿、作品信息并取回已上传的原图。

## 构建、验证和部署

```sh
pnpm nx run aiao-media:offline-assets
pnpm nx run-many -t lint typecheck -p aiao-media
pnpm nx run-many -t test -p aiao-media
pnpm nx run aiao-media:relay-test
pnpm nx run aiao-media-e2e:local-first-e2e
pnpm nx run aiao-media:requirements-check
pnpm nx run aiao-media:deploy-check
```

静态产物为 `aiao-media/apps/web/dist/browser`，不生成 SSR server bundle。浏览器测试使用真实 Chrome、RxDB、WASM、IndexedDB 和 OPFS，供应商使用 fixture，不消耗真实模型额度；也可通过 `AIAO_PLAYWRIGHT_CHANNEL` 选择已安装渠道。

```sh
# 生产形态本地预览：静态资源 + 可选无状态代理
pnpm nx run aiao-media:preview

# Cloudflare 账号授权完成后发布真实应用
pnpm --dir aiao-media/apps/web exec wrangler login
# 提前设置平台 AIAO_SUPABASE_URL、AIAO_SUPABASE_ANON_KEY 与同项目 Worker secrets
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false \
pnpm nx run aiao-media:deploy --skipRemoteCache
# 正式站点： https://media.aiao.io
```

部署使用 Cloudflare Workers Static Assets 和同一个 Worker 的代理接口；代理任务使用 SQLite Durable Object 与私有 R2 bucket（需先开通 R2 订阅并创建 bucket 与生命周期规则），不需要容器或云数据库；静态目录也可独立发布到 Pages。方案、免费额度边界、代理允许列表、分两次发布与回退见 [部署说明](deploy/local-first-pages.md)。发布前会检查产物中的凭据、旧 API 调用、文件大小和 SSR 运行时。

正式域名的代理三画幅、离线内容回读及真实静态构建更新/回退已验，线上当前版本见[验收记录](../../requirements/verification-report.md#正式环境证据)。本轮账号、同步与后台仅使用本地 Supabase；直连和跨 origin 原图 URL 仍有未验项，见[状态概览](../../requirements/status-overview.md#未完成验收与关闭条件)。

## 设计与历史资料

- [当前路线图](../../requirements/roadmap.md) · [真实应用集成验证](../../requirements/plans/local-first-app-verification.md)
- [独立直连实验](direct-provider-probe/README.md) · [真实网关 CORS 实测](../../requirements/plans/local-first-direct-probe-verification.md)
- [界面设计总览](../../requirements/design/image-mvp/00-overview.png) · [交互原型](../../requirements/design/image-mvp/index.html)
- [需求索引](../../requirements/README.md) · [验收记录](../../requirements/verification-report.md)

旧的 Bun/Elysia API、PostgreSQL、SSR/BFF、音视频与 Electron 桌面代码已于 2026-10-23 删除（来源见 ../../requirements/plans/source-import.json）。当前本地版本使用 `aiao-media-e2e:local-first-e2e` 验证。

## 旧构建升级验收

用已冻结的 RxDB 0.0.26 旧构建目录执行：

```sh
AIAO_MEDIA_BASELINE=/absolute/path/to/previous/browser pnpm nx run aiao-media-e2e:upgrade-e2e
```

该套件在同一浏览器 origin 下先使用旧构建写入真实 SQLite/IndexedDB/OPFS 数据，再切到当前构建读取并导入旧备份；供应商使用 fixture。旧构建作为外部验收输入，不提交到源码。
