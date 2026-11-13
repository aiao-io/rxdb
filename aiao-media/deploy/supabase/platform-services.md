# 平台服务配置与运维

2026-11-13 起按 [D-19](../../requirements/decisions.md#d-19登录用户经平台积分生图移除用户自配供应商) 提供登录账号与积分生图。模型和上游凭据只由服务端托管，积分由后台发放；充值、退款与价格体系继续按 [D-17](../../requirements/decisions.md#d-17充值退款与价格体系暂缓平台生图已按-d-19-恢复为积分制) 暂缓。历史 `/api/platform/`、无状态 `/api/relay`、供应商配置与公开探针均不再作为当前入口。

当前生成由 `/api/relay/tasks/:id`、`RelayTask` 与 `RELAY_RESULTS` 执行。海外 Cloudflare 与国内 Node 使用同一平台模型和积分契约；本地通过的证据见[平台接线记录](../../requirements/plans/platform-relay-credits-20261113.md)，正式双部署尚待分别验收。

## 账号与账本配置

1. 独立空 Supabase 产品项目使用 `pnpm nx run aiao-media:production-bundle` 生成的 SQL 包，经审查后初始化；已有产品项目只执行审查过的前向升级，禁止重跑空库包。当前账本需要 `012-credits.sql` 与 `013-relay-credit-abandonment.sql`；`aiao-media:package-admin` 将两项生成在 `/admin/upgrade-credits.sql` 的一个事务中。先备份已有项目，并核对升级产物的源摘要。
2. Worker secrets 为 `MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY`。国内 Node 在受保护环境文件中配置同名变量。公开构建的 `AIAO_SUPABASE_URL` 和 `AIAO_SUPABASE_ANON_KEY` 必须属于同一项目；浏览器不接收 service role 或模型凭据。
3. Supabase Auth 配置正式站点与精确返回地址、注册策略和邮件服务。用户只注册或登录平台账号；启用邮箱确认时，注册响应没有 session 就不能提前生成或同步。国内目前关闭公众注册，可信运维创建确认账号，不能沿用海外注册结论。
4. 由可信管理员授权入口建立产品管理员，再通过后台用户页调整积分并填写原因。余额、预占与不可变流水共用同一账本；生成先原子预占，本机校验结果并确认后只扣一次，拒绝、失败或待核对释放预占。

## 平台模型与任务配置

- `MEDIA_PLATFORM_MODELS` 是服务端 JSON 数组，每项为 `id`、可选 `name`、HTTPS `baseUrl`、上游 `model`、凭据环境变量名 `secret` 与单张正整数 `credits`。公开 `/api/models` 仅返回 `id/name/credits/protocol`。
- 每个 `secret` 引用独立的受保护服务端凭据；`ALLOWED_PROVIDER_BASE_URLS` 是规范化 API 前缀的 JSON 数组。每个模型的前缀必须在其中；凭据或允许列表无效时明确返回不可用，不接受用户传入的供应商地址或 Key。发布内容中的既有模型/画幅启停策略继续约束接单。
- Cloudflare 配置 `RELAY_TASKS` Durable Object 与私有 `RELAY_RESULTS` R2 bucket。不开公开访问，配置 1 天生命周期规则；应用 24 小时清理前先确认账本终态，账本故障保留任务与密文并重试释放。国内 Node 使用持久 SQLite 与加密文件目录，启动时恢复 alarm。
- 浏览器接单带平台会话、公开模型 ID、提示词、单张尺寸和设备任务令牌；后续查询、结果、确认与删除只用设备令牌。结果以 AES-GCM 密文暂存，成功保存本机后删除；保存失败保留原结果供续接。正式部署步骤见 [Cloudflare 发布](../cloudflare/local-first-pages.md#正式发布)与[国内部署](../../requirements/plans/dual-region-deployment.md)。
- 历史 `MEDIA_PLATFORM`、`MEDIA_RESULTS`、免费日额度、预算和 Stripe 配置不参与当前积分任务。保留历史类、迁移与数据不代表重新开放支付或旧任务 API。

示例配置在 [Cloudflare 私有变量模板](../cloudflare/.dev.vars.example)。模型凭据、service role 和会话不写入 Git、Wrangler vars、网页、桌面包或验收记录；本机私有文件不自动上传为生产 secrets。

## 账号与跨设备同步

首次启用同步仍需确认本机数据范围，原图上传另行确认。草稿、作品信息与旧版公开配置继续兼容；账号会话、设备任务令牌、本机路径和文件句柄不进入同步或备份。

结构化数据继续使用 `rxdb-adapter-supabase`、history 与 sync 插件；原图通过统一平台项目的私有 `aiao-media-images` Storage 上传、下载并校验 SHA-256。每个账号的工作区由 `media_ensure_workspace` 建立，表与私有 Storage 的 RLS 使用 `auth.uid()` 和工作区归属隔离用户。上线前验证两个普通账号之间无法读取、修改或下载对方数据；管理员权限不替代用户数据授权。

正式验收分别记录迁移、公开配置、模型目录、后台发放、真实账号三画幅、积分流水、刷新续接与精确下载，再验证公众邮件和 Web/Tauri 跨设备原图。本地 fixture、dry-run 和账号字段齐全不替代正式证据。
