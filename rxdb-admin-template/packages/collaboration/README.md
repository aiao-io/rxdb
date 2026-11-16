# 产品协作包

`@rxdb-admin-template/collaboration` 是三个工作台复用的产品私有包，不发布到 npm。React、Angular、Vue 都在 `/collaboration` 懒加载同一套任务、讨论与审核交互；原匿名资产工作台、数据库名称与连接前恢复入口保持独立。

## 运行方式

协作服务是一个 Node.js 服务，使用 Supabase 验证每次请求的真实身份，并通过 PostgreSQL 事务修改协作状态。浏览器只使用 Supabase 的公开 key 和本产品 HTTP API。部署时将 `/collaboration-api/*` 转发到协作服务；开发时三个应用已有代理，默认指向 `127.0.0.1:8088`，可用 `ADMIN_API_URL` 更改开发代理目标。

服务端环境变量：

| 变量                                | 用途                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_URL`                      | Supabase 项目地址                                              |
| `SUPABASE_ANON_KEY`                 | 公开 anon / publishable key；服务端启动时拒绝 service role key |
| `ADMIN_DATABASE_URL`                | 仅服务端使用的 PostgreSQL 连接，具有产品迁移表的事务写入权限   |
| `ADMIN_ALLOWED_ORIGINS`             | 允许的工作台来源，逗号分隔，含协议与端口                       |
| `ADMIN_API_PORT` / `ADMIN_API_HOST` | 默认 `8088` / `127.0.0.1`                                      |

邮箱登录需要在 Supabase 配置邮件发送服务，并将 passwordless 邮件模板配置为显示 `{{ .Token }}` 验证码。允许创建认证账号不等于授予团队成员关系；新用户必须接受匹配其已验证邮箱的邀请。

先应用迁移：

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:migrate
```

然后使用可信服务端环境执行一次初始化，额外提供 `SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_INITIAL_USER_ID`、`ADMIN_TEAM_ID`、`ADMIN_APP_ID`、`ADMIN_TEAM_NAME`、`ADMIN_BOOTSTRAP_KEY`。初始用户必须已在 Supabase 验证邮箱；初始化只创建空共享分支、管理员和默认审批策略，不导入样例数据。

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:bootstrap
NX_NO_CLOUD=true pnpm nx run admin-collaboration:serve-api
```

初始化参数与稳定键一致时返回既有团队，不重置策略与权限。浏览器没有初始化接口，也不得获得数据库连接或 service role key。

## 状态与事务

本地数据库名和索引均包含用户、团队、应用、任务。编辑器输入先保存到任务工作树；点击同步时，工作树快照、不可变提交与 outbox 在同一 IndexedDB 事务里写入。上传期间的后续保存留在下一份工作树中。任务同步保留提交 ID、父链与作者，不把通用实体推拉当成提交图复制。

服务端按团队/应用锁定状态行，先校验当前身份与权限，再执行命令。提交、候选、审批、阻塞讨论、成员与策略变更共享这一裁决顺序。只有 `merge` 能更新共享业务数据；共享头、数据、逐记录变更日志、PR、合并提交、候选关联、策略快照和审计在同一个 PostgreSQL 事务中落地。所有普通客户端角色都只能按 RLS 读取公开投影，不能直接写入。

每次业务命令有稳定幂等键。上传 outbox 持久化原请求；其他尚未确认的请求保留在当前用户的会话存储中，并提供回执查询与原请求重试入口。分叉恢复通过另存为新任务完成，原任务与 PR 的远端头不被覆盖。

候选包含 B/S/T、冲突选择、最终记录、规则版本和检查。审批只绑定检查通过的当前候选；撤销审核权后再授权不会复活旧批准。未解除的要求修改与必须处理线程不会被新候选或免审批策略清除。多阶段审批支持人数、阶段审核人和前置阶段。

协作页面的 Service Worker 只缓存静态页面和脚本等资源，不缓存认证或产品 API。冷启动离线仍须有未过期的验证记录，且只能打开原用户已缓存且未锁定的任务。主动退出立即锁定本机上下文；远端撤权在在线重新验证时生效。Presence 每 15 秒更新，45 秒过期，不授予操作权限。

## 验证

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test-integration
NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e
NX_NO_CLOUD=true pnpm nx run-many -t typecheck,lint -p admin-collaboration
```

数据库集成测试使用临时 Docker PostgreSQL，验证 RLS、并发头比较与事务失败回滚。三端浏览器测试使用工作区隔离的 Supabase Auth 和临时 PostgreSQL；验证码由 Auth 的管理测试接口生成，再由真实 `verifyOtp` 验证，因此不代表生产 SMTP 投递已验收。测试运行后移除临时数据库；共享 Supabase 测试栈可用 `rxdb-adapter-supabase:test-env-down` 关闭。

首版协议使用完整记录快照，每次请求最多 2 MiB、单任务最多 10000 条记录、单次最多 100 个提交。超限明确拒绝。规模扩大前需另行实现分页快照与历史存储分区，不能通过跳过校验或截断提交解决。

产品故事与未完成验收以 `../../requirements/plans/collaboration-implementation.md` 为准；本包存在并不意味着所有 AC 已通过或功能已合入。
