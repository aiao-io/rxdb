# 首次安装

self-hosted 与 Cloudflare 都使用同源 `/admin/` 完成首次设置。未初始化时用户端自动进入此页面；完成后此页面变为管理员登录，不能再次创建首个管理员。

## self-hosted

1. 在目标主机运行 `aiao-media:prepare-self-hosted` 准备部署文件；它会同时构建并复制 API Node 运行产物。部署密钥和一次性安装密钥保存在忽略的 `aiao-media/tmp/self-hosted/.env`，再次运行保留原值。
2. 在 `.env` 中填写 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 和 `SMTP_ADMIN_EMAIL`，可选填写 `SMTP_SENDER_NAME`。邮件未配置时 Compose 会拒绝启动，避免密码恢复和邀请流程静默失效。
3. 运行 `aiao-media:release-check`，把完整 `apps/web/dist/browser` 部署到 Compose 的 `web` 目录，其中包含 `admin/`；保留持久数据目录和 `.env`。应用数据库迁移，包括 `011-installation.sql`。
4. 启动服务，访问站点，使用 `.env` 中的 `MEDIA_INSTALLATION_BOOTSTRAP_SECRET` 和至少 12 位管理员密码完成首次设置。本机 Supabase 地址和密钥自动使用部署配置。

## Cloudflare

1. 先配置 Worker secrets `MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY` 和一次性 `MEDIA_INSTALLATION_BOOTSTRAP_SECRET`，再使用 `aiao-media:deploy-check` 检查产物并按正式发布流程部署。产物包含 admin 和 Installation SQLite Durable Object；保留现有绑定及迁移顺序。
2. 首次访问直接进入向导。填写部署初始化密钥、管理员邮箱和密码；服务端已配置的 Supabase 项目会自动使用，不把服务端密钥交给浏览器。初始化成功后部署密钥不再接受任何请求。
3. 新 Supabase 项目在 SQL 编辑器执行向导提供的新项目安装 SQL；已有 Aiao Media 站点只执行增量 `011-installation.sql`，使用原管理员账号和密码。新项目 SQL 带空库保护，不能用于覆盖已有数据库。

账号邮件、注册开放策略和站点 URL 仍由 Supabase 项目维护。向导创建的首个管理员已确认邮箱，其他用户的注册确认方式不随此操作改变。

## 状态与恢复

首次初始化无需额外安装凭据。服务端密钥保存在服务器 SQLite 或 Durable Object 存储中，公开接口只返回 URL 和公开 Key；管理员密码仅用于创建/验证账号，不写安装状态。

服务检查失败时可以修正配置后重试。开始创建账号后，保留原服务配置，管理员邮箱可以修改；账号尚未创建时使用填写的邮箱和密码新建，已经创建的账号验证原密码。失败记录不锁定邮箱。数据库授权和安装完成回执可重复确认；并发提交只接受一次。完成后刷新或重启不会重新开放安装。

已有管理员时，先验证原账号与管理员权限，不创建额外账号。邮箱已存在时继续验证原密码；密码不正确会明确提示，可以修正后重试，不会覆盖密码。

不要删除安装数据来重置密码。备份 self-hosted 的安装数据库和应用数据库；Cloudflare 保留 Installation 对象。密码恢复使用既有账号恢复或可信运维流程。

用户端在线读取安装后的公开配置，无需重新构建；浏览器只缓存这些公开值以支持离线启动。后台访问令牌只保存在当前页面内存，刷新、关闭标签页或过期后需要重新登录；不会保存 refresh token 或服务端密钥。
