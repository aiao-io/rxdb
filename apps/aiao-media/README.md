# Aiao Images

Local-first 图片创作应用：发现灵感 → Tiptap 编辑提示词 → 使用自己的供应商生成 → 本机保存、下载和备份。

默认 Angular 入口已切换到本地版本，无需登录、业务 API、PostgreSQL 或 Supabase。应用数据使用 RxDB / SQLite / IndexedDB，原图使用 storage plugin / OPFS；可选 Supabase 注册/登录和会话恢复已实现；账号绑定、原生 RxDB 多副本同步和业务后台已在真实本地服务接线验证。旧账号命名空间保留，不会自动删除或合并。当前优先桌面能力与跨用户业务后台，移动端验收暂缓；绑定和后台方案见[实施计划](requirements/plans/README.md)。

迁入来源与兼容验证见[迁移验收](requirements/plans/rxdb-import-verification.md)。应用需求在本目录内独立维护，平台需求仍位于仓库根。

桌面安装版、平台生图与计费、自有 Supabase 接入和同步管理的当前实现与未验边界见[产品交付计划](requirements/plans/product-completion-20261030.md)。本地安装说明见 [Tauri](src-tauri/README.md)，平台配置见[服务部署](deploy/platform-services.md)。

## 运行

需要 Node.js >=26、pnpm 10，以及支持 OPFS、Web Locks、WASM 的现代浏览器。前端不需要 `.env` 或数据库。

```sh
pnpm install --frozen-lockfile
pnpm nx run aiao-media:serve
```

打开 `http://localhost:4300`，四个页面分别为 `/`、`/create`、`/images`、`/providers`。首次打开时会自动创建并选中当前免费的默认供应商；如果本机还没有 API Key，生成时会引导你填写。也可以在供应商设置页覆盖默认项，填写自己的名称、HTTPS Base URL、图片模型 ID 和 API Key。Base URL 填 API 前缀：Images API 追加 `/images/generations`，MiniMax 官方前缀追加 `/image_generation`。

当前适配器支持单张 PNG/JPEG 原图，按实际字节识别格式并原样保存、下载。Images API 使用 `n=1`、`quality=low`、`output_format=png`；MiniMax 官方前缀使用 `image-01`、`response_format=url`，关闭提示词优化。三个请求尺寸为 1024×1024、1536×1024、1024×1536；供应商必须支持对应参数。真实供应商验收可使用忽略的本地 `.env`，字段见 [`.env.example`](.env.example)；本次验收额度不限，Key 不进入发布产物。

模型 ID 使用 1–128 位英数字、点、下划线、冒号或短横线。支持读取 `b64_json` 或允许跨域读取的 HTTPS 图片 URL，不代表兼容所有图片 API。

- **浏览器直连，自建配置默认**：Key 和提示词直接发给供应商，本站不接收。供应商 API 和结果图片均须支持 CORS。
- **本站代理，明确选择或预设声明**：本次 Key 和参数经本站 Worker 转发；此 relay 不持久化 Key 或结果，不使用业务数据库，仅允许运营配置的供应商前缀。开发服务器不带代理；生产预览使用 `aiao-media:preview`。
- 默认 Key 只保留在当前页面内存。勾选“在此设备记住 Key”后，写入本机专门的凭据记录；配置、任务记录和备份不包含凭据。
- 请求发送前先写本机任务记录。超时、CORS、断网或刷新后结果不确定时不自动重发、不自动切换代理。用户核对供应商记录后才能解除锁定。

首次联网完成离线资源安装后，四个页面及本机草稿、配置、作品可离线打开。模型生成始终需要联网，供应商调用费用由用户承担。

## 本机数据和备份

供应商页提供存储配额提示、持久存储申请、完整 JSON 备份导出/导入。备份包含原图、SHA-256 摘要、提示词草稿、供应商配置和最近 100 条任务记录，固定排除 API Key，单个文件最多 64 MiB。

导入先验证格式、版本、图片摘要、尺寸和可解码性，再写入独立工作区；全部成功后才切换。原工作区保留，失败不会覆盖它，相同备份中断后重新导入可继续写入暂存工作区。原工作区 ID 保存在 `aiao-local-previous-profile-v1`，不自动合并。请定期下载重要图片和备份；清除浏览器站点数据会清除全部本机工作区。

## 可选账号与本地 Supabase

本机创作无需账号配置。部署方同时设置 `AIAO_SUPABASE_URL` 和公开 `AIAO_SUPABASE_ANON_KEY` 后重新构建，才显示注册/登录入口；禁止使用 service role 或 secret Key。登录本身不绑定、不上传。显式启用后仅同步草稿、供应商公开配置和作品信息，Key 和原图留在本机。后台私有配置、可信管理员初始化和验收边界见[本地产品交付验收](requirements/plans/local-delivery-verification.md)。

本机调试和真实服务验收使用 Docker Compose，开发凭据自动保存在忽略的 `infra/supabase/.env`：

```sh
# 启动真实本地 Auth，使用公开配置运行前端
pnpm nx run aiao-media:supabase-serve
# 真实邮箱确认、RLS/Realtime 和会话刷新/退出探针
pnpm nx run aiao-media:supabase-test
# 真实 Chrome 注册/登录/恢复/退出与断网恢复
pnpm nx run aiao-media:supabase-e2e
# 停止服务并保留数据库卷
pnpm nx run aiao-media:supabase-down
```

真实账号浏览器套件使用独立的 4399 端口，先构建生产静态应用；常规本机套件使用 4398 端口和 Auth fixture。两套浏览器验收按顺序运行。范围和隔离说明见[账号验收说明](requirements/plans/supabase-account-verification.md)。

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

静态产物为 `apps/aiao-media/dist/browser`，不生成 SSR server bundle。浏览器测试使用真实 Chrome、RxDB、WASM、IndexedDB 和 OPFS，供应商使用 fixture，不消耗真实模型额度；也可通过 `AIAO_PLAYWRIGHT_CHANNEL` 选择已安装渠道。

```sh
# 生产形态本地预览：静态资源 + 可选无状态代理
pnpm nx run aiao-media:preview

# Cloudflare 账号授权完成后发布真实应用
pnpm --dir apps/aiao-media exec wrangler login
# 本轮 Supabase 仅本地，正式产物关闭账号配置
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false \
AIAO_SUPABASE_URL='' AIAO_SUPABASE_ANON_KEY='' \
pnpm nx run aiao-media:deploy --skipRemoteCache
# 正式站点： https://media.aiao.io
```

部署使用 Cloudflare Workers Static Assets 和同一个 Worker 的 `/api/relay`，不需要容器或云数据库；静态目录也可独立发布到 Pages。方案、免费额度边界、代理允许列表和回退见 [部署说明](deploy/local-first-pages.md)。发布前会检查产物中的凭据、旧 API 调用、文件大小和 SSR 运行时。

正式域名的代理三画幅、离线内容回读及真实静态构建更新/回退已验，线上当前版本见[验收记录](requirements/verification-report.md#正式环境证据)。本轮账号、同步与后台仅使用本地 Supabase；直连和跨 origin 原图 URL 仍有未验项，见[状态概览](requirements/status-overview.md#未完成验收与关闭条件)。

## 设计与历史资料

- [当前路线图](requirements/roadmap.md) · [真实应用集成验证](requirements/plans/local-first-app-verification.md)
- [历史直连 CORS 实测](requirements/plans/local-first-direct-probe-verification.md)
- [界面设计总览](requirements/design/image-mvp/00-overview.png) · [交互原型](requirements/design/image-mvp/index.html)
- [需求索引](requirements/README.md) · [验收记录](requirements/verification-report.md)

旧的 Bun/Elysia API、PostgreSQL、SSR/BFF、音视频与 Electron 桌面代码已于 2026-10-23 删除（来源见 requirements/plans/source-import.json）。当前本地版本使用 `aiao-media-e2e:local-first-e2e` 验证。

## 旧构建升级验收

用已冻结的 RxDB 0.0.26 旧构建目录执行：

```sh
AIAO_MEDIA_BASELINE=/absolute/path/to/previous/browser pnpm nx run aiao-media-e2e:upgrade-e2e
```

该套件在同一浏览器 origin 下先使用旧构建写入真实 SQLite/IndexedDB/OPFS 数据，再切到当前构建读取并导入旧备份；供应商使用 fixture。旧构建作为外部验收输入，不提交到源码。
