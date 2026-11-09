# Aiao Media

self-hosted 与 Cloudflare 安装后首次访问统一进入 `/admin/`，配置账号服务和管理员邮箱、密码；步骤与恢复边界见[首次安装](deploy/installation.md)。

在仓库根目录启动本地开发环境：

```bash
pnpm nx dev aiao-media
```

需要 Node.js 26+、pnpm 和已启动的 Docker。首次运行自动初始化本地 Supabase 配置、拉起容器并迁移数据库、启动 Studio 管理页面，之后启动三个支持热更新的应用。

Web、Admin 和 API 就绪后自动打开[开发导航](http://127.0.0.1:8787/)，集中展示服务用途、入口、测试账号与密码、数据库连接信息，支持一键复制。测试账号在启动时自动创建并确认邮箱；再次启动保留账号 ID 和已有数据，恢复默认测试密码。管理员账号可登录独立 Admin，开发环境沿用预置账号，不执行生产安装向导。

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
