# Aiao Media

在仓库根目录启动本地开发环境：

```bash
pnpm nx dev aiao-media
```

需要 Node.js 26+、pnpm 和已启动的 Docker。首次运行自动初始化本地 Supabase 配置、拉起容器并迁移数据库、启动 Studio 管理页面，之后启动三个支持热更新的应用。

| 服务              | 地址                                                  |
| ----------------- | ----------------------------------------------------- |
| Web               | http://localhost:4300                                 |
| Admin             | http://localhost:4302                                 |
| API               | http://127.0.0.1:8787/api/templates                   |
| Supabase 管理页面 | 启动日志中的 `Supabase Studio`（`STUDIO_PORT`）       |
| Supabase API 网关 | 启动日志中的 `Supabase API`（`API_PORT`，无网页首页） |
| 注册确认邮件      | 启动日志中的 `Inbucket`（`MAIL_PORT`）                |

Supabase Studio、API 和邮箱的实际地址会显示在 `dev-config` 启动日志中，端口取自 `infra/supabase/.env`。查看数据库、账号和 SQL 编辑器请打开 Studio；API 网关的根路径返回 404。Web 与 Admin 的 `/api/**` 都转发到完整的本地 Worker。独立 Admin 目前只有管理界面，账号验证尚未接线。

多检出目录可在各自的 `infra/supabase/.env` 中设置不同的 `COMPOSE_PROJECT_NAME` 和四个端口。已有数据卷的密码须与该文件一致。

交互终端默认使用 Nx TUI，可切换查看 Web、API、Admin 与数据库日志。使用 `pnpm nx dev aiao-media --tui=false` 输出普通日志。

Ctrl-C 停止应用与日志进程；Supabase 容器继续运行并保留数据。停止数据库：

```bash
pnpm nx run aiao-media:supabase-down
```

开发配置只读取本地 `infra/supabase/.env`，不覆盖已有的 Worker `.dev.vars`。本地 Worker 的临时配置和服务端密钥生成在忽略的 `apps/api/.wrangler/local-dev/`，浏览器只接收本地 URL 和公开 anon Key。

仅开发前端可继续使用 `pnpm nx serve aiao-media`，不需要 Docker。多检出目录的数据库卷与端口隔离、账号验收和生产形态预览见 [Web 开发说明](apps/web/README.md)。
