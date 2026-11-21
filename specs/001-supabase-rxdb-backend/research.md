# Research: Supabase-first 后台与 RxDB 同步架构

## Decision 1: 普通业务请求直连 Supabase，特权操作使用 Edge Function

- **Decision**: Admin 浏览器直接使用 Supabase Auth、PostgREST、受保护 view/RPC 和 Storage；Auth Admin API、封禁/解禁、`service_role`/secret 操作只进入 Edge Function。
- **Rationale**: 普通业务路径不需要重复经过 Cloudflare Hono 代理；特权操作仍保持服务端密钥边界。普通 RPC 从 `auth.uid()` 获取操作者，不能信任浏览器传入的 actor/user ID。
- **Evidence**:
  - Web 已经在 `aiao-media/apps/web/src/app/supabase-auth.ts` 直连 Auth。
  - Admin 目前通过 `aiao-media/apps/admin/src/app/app.ts` 和 `product-client.ts` 访问 `/api/admin/*`。
  - `aiao-media/apps/infra/supabase/migrations/005-product-content.sql`、`006-trusted-membership.sql` 和 `012-credits.sql` 已有管理员 RPC、RLS 和幂等审计基础。
- **Rejected alternative**: 所有后台请求继续经 Cloudflare Worker。这样可以保持单一 HTTP 入口，但普通查询、参数校验、错误映射和部署边界重复，无法减少应用复杂度。

## Decision 2: Admin Auth 迁移到 Supabase Auth

- **Decision**: Admin 使用 Supabase 客户端完成登录、刷新、退出和会话恢复；迁移期间保留旧 session 兼容读取，旧 `/api/admin/login` 进入弃用期。
- **Rationale**: Web 已经使用同一套 Auth；统一会话可消除 Admin 自定义 token 保存和密码代理。
- **Security**: 浏览器只持有 publishable/anon 兼容 key 和用户 JWT；secret/service role 不进入 bundle。
- **Rejected alternative**: 保留 Worker 登录代理。它保护了 Supabase URL，但不能提供比 Supabase Auth 更好的会话语义，并额外承担密码转发和 token 映射。

## Decision 3: 后台服务作为普通 RxDB 同步节点

- **Decision**: Node 后台服务运行本地 RxDB，使用 `@aiao/rxdb-adapter-supabase` 和 `@aiao/rxdb-plugin-sync`，以普通 JWT 访问 RLS 保护的业务数据；特权动作调用 Edge Function。
- **Rationale**: 仓库已有 `pullChanges`、`mergeChanges`、Realtime、`syncManager.sync()` 和 `syncManager.syncBranches()`。复用这些能力比另写后台 CRUD/cache 状态机更简单。
- **Boundary**: 同步业务实体和分支元数据；不把 RxDB 内部系统表直接暴露为公共同步契约。
- **Rejected alternative**: 后台使用 service role 直接同步。它会绕过 RLS，无法验证后台服务自身的租户边界，也会让误配置变成全库写权限。

## Decision 4: 用领域 commit projection 同步配置提交

- **Decision**: 保留 RxDB working-tree 的本地 `Commit`/`CommitChangeSet`，另建 `media_config_commits` 和 `media_config_commit_changes` 作为普通可同步领域实体。
- **Rationale**: RxDB 系统实体不属于普通 HTTP 同步范围；直接同步内部系统表会把本地存储实现、清理和版本兼容性暴露成 Supabase 公共契约。
- **Consistency**: projection 使用 `commitId`、`operationId`、`parentIds`、`contentFingerprint` 和完整 envelope；后台用原子 apply RPC 校验并应用。
- **Recovery**: `commits$` 只是触发器，不是可靠 outbox。启动时扫描 `listCommits()` 补齐缺失 projection，重复写入由唯一键和幂等操作标识收敛。
- **Rejected alternative**: 把 `Commit`、`CommitChangeSet` 等系统表直接加入普通同步。当前适配器没有完整的 commit graph 同步协议，且会产生内部实现耦合。

## Decision 5: PGMQ 先做可回退 PoC

- **Decision**: 使用 `taskId`、`taskRevision` 和 `kind` 作为最小队列消息；任务正文、provider secret 和结果保留在受保护数据库/Storage；Node consumer 负责长任务。
- **Rationale**: PGMQ 适合持久化消息、visibility timeout、多个消费者和积压调度，但不替代任务状态、结果存储、积分和外部副作用幂等。
- **Current boundary**: Durable Object + SQLite + alarm + R2 继续作为生产实现，直到 PoC 覆盖 provider 成功后 ack 前崩溃、重复投递、长任务、重启和双区域。
- **Rejected alternative**: 直接删除 Durable Object 并把任务放入 PGMQ。当前任务已有刷新续接、结果取回、任务收敛和积分保护协议，直接切换会扩大故障面。

## Decision 6: `rxdb-model` 只负责模型驱动 UI

- **Decision**: Admin 配置页使用 `@aiao/rxdb-model` 和 `@aiao/rxdb-model-angular` 显示、筛选、编辑和校验 RxDB 实体；权限仍由 RLS/RPC/Edge Function 控制。
- **Rationale**: 公共包已经提供 Entity List/Detail/Form/Table/Query Builder；Admin 当前 `admin-console.ts` 是手写 signals 和远端 API 状态。
- **Boundary**: Angular 是 Aiao Media Admin 当前产品端；实体模型和公共 API 继续遵守跨框架对称规则。

## Resolved constraints

- Image Storage 已经直连 Supabase，不在此特性重新设计。
- 现有积分、任务、审计和双区域契约必须保持。
- PGMQ 不承载完整提示词、原图、provider key、session 或大型结果。
- 失败恢复优先保留本地数据和当前 Durable Object 回退路径。
