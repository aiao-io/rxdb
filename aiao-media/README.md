# Aiao Media

self-hosted 与 Cloudflare 安装后首次访问统一进入 `/admin/`，配置账号服务和管理员邮箱、密码；步骤与恢复边界见[首次安装](deploy/installation.md)。

在仓库根目录启动本地开发环境：

```bash
pnpm nx dev aiao-media
```

需要 Node.js 26+、pnpm 和已启动的 Docker。首次运行自动初始化本地 Supabase 配置、拉起容器并迁移数据库、启动 Studio 管理页面，之后启动三个支持热更新的应用。

Web、Admin 和 API 就绪后自动打开[开发导航](http://127.0.0.1:8787/)，集中展示服务用途、入口、测试账号与密码、数据库连接信息，支持一键复制。测试账号在启动时自动创建并确认邮箱；再次启动保留账号 ID 和已有数据，恢复默认测试密码。管理员账号可登录独立 Admin，开发环境沿用预置账号，不执行生产安装向导。

Admin 使用 `rxdb-admin-template-angular` 的后台外壳：认证和首次安装仍由 Aiao Media API 负责，登录后通过模板的侧栏、主题、页签、偏好设置和命令面板管理用户、模板、平台积分、任务用量与操作审计。

无需自动打开浏览器时使用 `AIAO_DEV_OPEN=false pnpm nx dev aiao-media`。

| 服务              | 地址                                |
| ----------------- | ----------------------------------- |
| Web               | http://localhost:4300               |
| 开发导航          | http://127.0.0.1:8787/              |
| Admin             | http://localhost:4302               |
| API               | http://127.0.0.1:8787/api/templates |
| Supabase 管理页面 | http://127.0.0.1:54323              |
| Supabase API 网关 | http://127.0.0.1:54321              |
| PostgreSQL        | `127.0.0.1:54322`                   |
| 注册确认邮件      | http://127.0.0.1:54324              |

端口固定，Supabase 端口统一维护在已提交的 `infra/supabase/ports.env`；私有 `.env` 中的旧端口值不会生效。查看数据库、账号和 SQL 编辑器请打开 Studio；API 网关的根路径返回 404。Web 与 Admin 的 `/api/**` 都转发到完整的本地 Worker。

端口冲突时先停止占用服务，再重试启动，不自动换号。多个检出目录使用同一套固定端口，不能同时启动；可用 `COMPOSE_PROJECT_NAME` 隔离数据卷，已有数据卷的密码须与对应 `.env` 一致。

交互终端默认使用 Nx TUI，可切换查看 Web、API、Admin 与数据库日志。使用 `pnpm nx dev aiao-media --tui=false` 输出普通日志。

Ctrl-C 停止应用与日志进程；Supabase 容器继续运行并保留数据。停止数据库：

```bash
pnpm nx run aiao-media:supabase-down
```

开发配置从 `infra/supabase/ports.env` 读取固定端口，从本地 `infra/supabase/.env` 读取凭据，不覆盖已有的 Worker `.dev.vars`。本地 Worker 的临时配置和服务端密钥生成在忽略的 `apps/api/.wrangler/local-dev/`，Web 应用只接收本地 URL 和公开 anon Key。

开发导航只由绑定 `127.0.0.1` 的本地 Worker 提供，包含本地测试账号和数据库密码，不进入 Web 静态资源或生产部署产物。JWT secret 和 service role key 不写入导航页面。

仅开发前端可继续使用 `pnpm nx serve aiao-media`，不需要 Docker。多检出目录的数据库卷与端口隔离、账号验收和生产形态预览见 [Web 开发说明](apps/web/README.md)。

平台生图的服务端接线按 [D-19](requirements/decisions.md#d-19登录用户经平台积分生图移除用户自配供应商) 改为真实平台账号、平台模型和积分账本。前端改版仍在进行，当前分支的旧供应商表单尚未完成替换，不作为可发布的完整生图流程。服务端不再接受按请求 Key 的 `/api/relay`。

模型由部署环境 `MEDIA_PLATFORM_MODELS` 定义，每项包含 `id`、展示 `name`、`baseUrl`、上游 `model`、凭据变量名 `secret` 与正整数 `credits`。`baseUrl` 必须同时列入 `ALLOWED_PROVIDER_BASE_URLS`；`secret` 指向只存在于 Worker secret 或 Node 服务端环境中的凭据。平台标识和上游型号分开，例如以下是需由部署者替换的配置形状：

```dotenv
MEDIA_PLATFORM_MODELS='[{"id":"standard","name":"平台生图","baseUrl":"https://provider.example/v1","model":"private-image-model","secret":"MEDIA_IMAGE_KEY","credits":3}]'
ALLOWED_PROVIDER_BASE_URLS='["https://provider.example/v1"]'
```

开发环境从 `apps/api/.dev.vars` 或进程环境读取模型和引用的凭据，仅写入权限 `0600` 的 `.wrangler/local-dev/.dev.vars`；不覆盖源配置，不复制无关密钥。Cloudflare 用 secret 绑定凭据；Node 通过服务端环境传入。模型、凭据或任务绑定缺失时明确返回 `503`，不调用上游。公开 `/api/models` 只返回平台标识、展示名、积分与响应协议，后台已发布的停用、型号和画幅策略仍限制接单。

现有 Supabase 项目先执行后台提供的 `/admin/upgrade-credits.sql`，包含 `012` 积分账本与 `013` 放弃封存迁移，在同一事务内升级；新项目初始化 SQL 包已同时包含两者。后台发放积分后，接单预占额度；上游失败或结果待核对释放预占。本机取得密文、解密并验证图片后通过 `/confirm` 幂等扣减；图片验证失败通过 `/discard` 释放预占。扣费应答丢失可用原任务令牌重试确认，不重复扣款。

服务端只加密暂存原始响应，不解析图片；Cloudflare 写入私有 R2，Node 写入私有数据目录。任务存储保存账号标识、额度、请求指纹、令牌摘要与状态。结清后删除结果；未取回结果在 24 小时后清理，清理前先确认积分已扣或已释放，账本故障时保留任务并重试。R2 的一天生命周期和真实客户端断开后的执行保证仍须正式环境验收，不能用本地替身结果替代。
