# PR：收敛 Git-like 数据协作审批后端与 Supabase 接入边界

> **评审状态：⚠️ Request changes**
>
> **评审类型：架构与目标匹配评审，不直接修改业务代码**
>
> **评审日期：2026-11-17**
>
> **当前分支：`admin-template`，HEAD：`111f7a6ce`**
>
> **范围：** `rxdb-admin-template/` 产品目录、`packages/collaboration`、Supabase migration、三端接线和产品需求。

## 结论

当前实现已经具备一套能工作的 **Git-like 数据 PR 审批闭环**：本地任务可以形成提交链，服务端校验父链和权限，PR 可以生成三方合并候选，审核绑定候选，只有通过检查和审批的 `merge` 才能更新共享数据，整个变更在 PostgreSQL 事务中落地。

所以，作为 **本地孵化版或小规模内部工具**，方向是对的；作为用户目标中的 **低成本 Supabase 后端和可复用 Admin 模板**，当前还不能直接定稿。主要原因有四个：

1. Supabase 目前只承担 Auth、Postgres 和 Realtime，真正的命令写入依赖额外部署的 Node API 和 `pg` 直连；部署组件和运维边界没有收敛。
2. 一个团队/应用的全部状态放在一行 JSONB 中，每次命令都复制、锁定、重写完整状态，审计、回执、通知也会无界增长。
3. 协作模型仍写死 `AssetCategory`、`Asset`、`AssetEvent` 和唯一的 `shared` 目标，当前更像资产示例的协作服务，不是可直接复用的 Admin 模板后端。
4. 生产部署、真实邮件 OTP、迁移发布、监控、回滚和长期运行容量仍未验收，`ADMIN-US-217` 还是 Backlog。

**建议保留现有纯 TypeScript 领域引擎和 PR 语义，先收敛数据边界与生产门禁，再决定是否把命令 API 迁移到 Supabase Edge Function。** 现在直接把整套引擎重写成 SQL/RPC，会增加实现风险，不能解决当前最紧迫的容量和交付问题。

## 当前实现与目标的匹配度

| 目标                                 | 当前判断    | 依据                                                                                                     |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| 像 Git 一样有提交父链、任务分支和 PR | 🟢 基本符合 | `Commit.parent`、`Task.base/head`、`PullRequest` 和 `reachable()` 已形成提交图与分叉校验。               |
| 审核只能针对当前候选                 | 🟢 符合     | `currentCandidate()` 校验来源、目标、策略版本和 schema 版本；批准前还会检查冲突和 checks。               |
| 合并必须经过权限、审批和事务         | 🟢 符合     | `execute()` 负责服务端裁决，`repository.operation()` 在锁和数据库事务内写入；共享数据只有 `merge` 更新。 |
| Supabase 认证与租户隔离              | 🟢 基本符合 | Auth 每次请求验证；公开投影使用 `auth.uid()`、`SECURITY DEFINER` helper 和 RLS。                         |
| 最小成本接入 Supabase                | 🟡 部分符合 | 复用了 Auth、Postgres、Realtime，但还需要常驻 Node API、独立数据库连接、迁移/初始化脚本和反向代理。      |
| 可复用 Admin 模板                    | 🔴 不符合   | 数据行实体、样例域名、目标分支和部分 UI 契约仍然写死在资产示例上。                                       |
| 长期运行和生产发布                   | 🔴 尚未满足 | 状态快照、审计、通知、回执没有保留策略；生产故事和真实环境证据尚未完成。                                 |

## 目前做得对的部分

### 1. 领域裁决和持久化边界基本正确

`packages/collaboration/src/server/engine.ts` 把命令执行做成纯函数式的状态裁决层。身份、权限、幂等键、版本号、提交父链、候选有效性和审核状态都在服务端重新判断，客户端不能通过隐藏按钮绕过规则。

`packages/collaboration/src/server/repository.ts` 对同一工作区使用事务和行级锁；`execute()` 成功后才更新工作区、共享投影、审计和版本通知。这一层适合继续保留，尤其是三方合并和多级审批，不应该把规则散落到三个前端或只依赖 RLS 表达。

### 2. Supabase 的公开边界设计方向正确

`supabase/migrations/202611160001_collaboration.sql` 把完整工作区状态放在 `admin_private`，客户端只能读取 `public.admin_shared`、`admin_audit`、`admin_changes`、`admin_workspace_versions` 和 `admin_presence` 的受限投影。公开表没有开放客户端写权限，RLS helper 通过成员投影判断 `team_id + app_id` 的读取权。

这符合 Supabase 的基本安全模式：用 `auth.uid()` 识别调用者，用私有 schema 的 `SECURITY DEFINER` helper 避免成员表递归，把客户端写操作收敛到受控服务端命令。服务端也检查了公开 key，初始化脚本才使用 service role key，浏览器没有数据库连接或管理凭据。

### 3. 离线与不确定响应的产品语义已经考虑到

客户端为命令保留稳定 `operationId`，网络断开或响应格式异常时不会把请求武断地当成失败，而是允许查询回执或重试原请求；会话退出、撤权和上下文切换也会锁定旧上下文。这些行为比普通 CRUD 同步更接近协作系统的实际需求。

## 必须调整的问题

### P0：上线闭环没有完成，当前只能标记为本地孵化

`packages/collaboration/README.md` 已经说明需要额外运行 Node API、迁移和可信初始化；`requirements/stories/collaboration/ADMIN-US-217-production-deployment-operations.md` 的迁移、部署、真实邮箱、密钥扫描、健康检查、监控、容量预算和回滚验收全部还是未开始。

这不是文档问题。没有这些证据，`ADMIN-US-201～216` 只能算本地实现和本地验证，不能算可发布的协作后端。

**必须补齐：**

- staging Supabase 项目和正式 Supabase 项目的迁移发布流程；迁移至少连续执行两次并确认无差异。
- 协作 API 的部署方式、反向代理路径、TLS、连接池、限流和健康检查。
- 真正的邮箱验证码投递与自然过期验收；隔离测试中由 Auth 管理接口生成验证码，不能替代生产 SMTP 证据。
- 密钥扫描：前端只能有 publishable/anon key，数据库连接串、service role key 和 bootstrap key 只能来自服务端环境。
- 部署后运行三端协作 E2E、跨团队/跨应用 RLS 验收，以及失败后的回滚或前向修复记录。
- 长期运行指标：快照大小、命令耗时、数据库连接数、Realtime 订阅数、错误率和未确认请求数量。

### P1：整行 JSONB 状态不适合长期作为唯一存储

当前 `Workspace` 把成员、任务、提交、PR、候选、邀请、审核、讨论、通知、回执和审计全部放在 `admin_private.workspaces.state` 一行 JSONB 中。每次普通命令都会：

1. `SELECT ... FOR UPDATE` 锁住整行；
2. `structuredClone` 完整工作区；
3. 在内存里执行命令；
4. 把完整 JSONB 写回；
5. 再把投影和审计从完整状态重新展开。

这在小团队、少量记录时很实用，能快速保证单一裁决顺序；随着提交、评论和审计增长，写放大、锁等待、快照传输和数据库 WAL 都会随状态大小增长。当前代码已经明确限制单次请求 2 MiB、单任务 10000 条记录、单次最多 100 个提交，这些是实验边界，不是可扩展设计。

**建议调整为两步：**

- **第一步，保持领域引擎不变：** 增加 `admin_operations`（幂等键、指纹、结果、状态、创建时间）和 `admin_workspace_snapshots`/`admin_workspace_heads`；把回执、通知、审计从工作区 JSONB 拆出来，增加 TTL、归档和分页。提交内容在第一阶段仍可用 JSONB，避免一次改动过大。
- **第二步，按增长热点拆分：** 成员、PR、review、thread、commit metadata 使用独立表；记录快照或变更集按提交存储。保留一个物化的共享头供读取和 Realtime，合并时用同一事务追加事件并更新投影。

在完成第一步之前，必须把产品定位写成“有容量上限的 v0”，不能把当前结构描述成通用 Git 后端。

### P1：投影写入存在重复扫描和不必要的重建

`repository.project()` 每次状态变化都会：

- 删除并重建整个 `admin_private.memberships` 投影；
- 通过 `jsonb_array_elements(state.audit)` 扫描完整审计数组，再用 `ON CONFLICT DO NOTHING` 过滤旧行；
- 每次都写 `admin_workspace_versions`，触发整个工作区重新读取；
- 只在共享 head 变化时更新 `admin_shared`，但成员、审核、讨论和通知仍然会触发完整版本通知。

这会让每条评论、审核和成员操作都付出与整个历史长度相关的成本。

**建议调整：**

- 只写入本次命令产生的 audit、change、receipt 和 notification；不要从完整状态反向扫描历史。
- 只有成员权限实际变化时更新 membership projection。
- 列表接口直接读成员索引/成员表，不要查询所有 workspace 的完整 JSONB 再在 Node 中过滤。
- 公开投影按用途拆分：`workspace_versions` 只做失效通知，业务读取按分页 API 或 RLS 查询；不要让一个版本变更自动等价于拉取全量快照。

### P1：当前不是“只接入 Supabase”，而是“Supabase + 自建命令服务”

当前运行时需要：

- Supabase Auth 验证每个 Bearer token；
- Node HTTP API；
- `ADMIN_DATABASE_URL` 直连 PostgreSQL；
- migration 和 bootstrap 进程；
- 前端代理/反向代理；
- Realtime publication。

这套拆分可以实现复杂事务，但必须在产品定位中说清楚。它不是只创建 Supabase 表就能运行的 BaaS 接入。

**推荐的低成本路线：**

1. **近期不重写现有引擎。** 把 Node API 作为唯一命令入口，部署成一个无状态小服务；Supabase 只提供 Auth、Postgres 和 Realtime，不再引入第二个业务数据库或额外消息队列。
2. **收紧数据库账号。** `ADMIN_DATABASE_URL` 使用专用数据库角色，限制在 `admin_private` 和产品投影表上的必要权限，禁止使用超级用户；连接启用 TLS、超时和最小连接池。
3. **读路径优先使用 Supabase/RLS。** 工作区列表、共享头、审计和变更读取尽量走公开投影和分页接口；命令写入继续由服务端裁决。
4. **后续再评估 Edge Function。** 如果部署目标必须只依赖 Supabase，保留纯领域引擎，把 HTTP 入口迁到 Supabase Edge Function，使用用户作用域客户端处理普通请求，把需要跨表原子写入的部分收敛到单个 RPC/SQL 函数。不要为了“看起来更 Supabase”而在当前阶段把复杂的合并算法重写成 PL/pgSQL。

Supabase 的服务器端建议是：用户请求使用用户作用域客户端和 RLS；只有明确的内部任务才使用绕过 RLS 的管理员客户端。无论继续 Node API 还是未来迁移 Edge Function，都要保留这个边界。

### P1：产品私有协作模型还没有泛化

`packages/collaboration/src/model.ts` 的 `DataRow.entity` 只接受 `AssetCategory | Asset | AssetEvent`，三端也直接导入资产实体和 `assets` 命名空间。PR 目标只有 `shared`，不是可配置的目标引用；任务、提交和候选没有绑定可插拔的领域 schema/校验器。

这会导致下一个使用者必须修改协作包源码，无法把它接到订单、内容、配置或其他 Admin 数据上。

**建议调整：**

- 协作层只定义通用 `RecordId`、`EntityName`、`RecordValue` 和 `DataSet`；资产实体移动到应用层的 domain adapter。
- 用 `schemaVersion + domainAdapter` 注入实体校验、字段标签、关系约束和合并检查；协作包不直接依赖 `Asset*` 类型。
- 把 `target: 'shared'` 抽象为 `Ref` 或 `TargetBranch`，首版可以只开放一个默认目标，但数据模型不要把唯一目标写死。
- 在提交入口由服务端校验 canonical payload；如果继续使用随机 UUID 作为提交 ID，就称为 opaque commit ID；如果要承诺 Git-like 内容寻址，则必须由服务端根据规范化内容计算并验证 hash。
- 把“数据 PR”与“源码 Git PR”明确区分：首版只保证记录级快照、父链、差异、审核和原子合并，不承诺 rebase、cherry-pick、merge queue、CI check run 或任意多分支。

### P2：RLS 和服务端直连的验证还要补强

现在的 RLS 主要保护公开读取投影；普通客户端不能直接写入，这是正确的。但命令服务使用 `ADMIN_DATABASE_URL`，它绕过了客户端 RLS，因此安全性取决于服务端代码和数据库账号的组合，而不是 RLS 单独兜底。

**建议补齐以下测试和配置：**

- `anon` 和 `authenticated` 直接对所有协作表执行 INSERT/UPDATE/DELETE，均明确拒绝。
- 已登录用户跨 `team_id`、`app_id` 读取共享、审计、变更、版本和 Presence，均返回空结果。
- 撤权后旧 token、旧 Realtime 订阅和旧待发送命令不能继续读取或写入。
- `admin_private` schema 不授予客户端表权限；`SECURITY DEFINER` 函数固定 `search_path`，只暴露必要的 `EXECUTE`。
- Realtime 订阅同时按 `team_id` 和 `app_id` 过滤，减少跨应用无效事件；服务端仍以 RLS 作为最终边界。
- 连接串使用专用角色和 TLS，禁止把 `postgres` 超级用户连接串当作生产 `ADMIN_DATABASE_URL`。

## 推荐的目标结构

```text
三端 Admin UI
  ├─ Supabase JS：Auth 会话 + 公开投影读取 + Realtime 失效通知
  └─ Collaboration API：命令、权限裁决、幂等、合并事务
                   │
                   └─ Supabase Postgres
                       ├─ admin_private：命令状态/内部投影
                       ├─ public：RLS 保护的读取投影
                       ├─ operations：幂等回执与重试记录
                       ├─ commits / prs / reviews / threads：按增长热点拆分
                       └─ workspace_versions / presence：Realtime 边界
```

如果最终要求“只部署 Supabase，不部署 Node API”，目标结构改为：

```text
三端 Admin UI
  ├─ Supabase JS：Auth + RLS 读取 + Realtime
  └─ Supabase Edge Function：用户认证、命令路由、领域引擎
                                      │
                                      └─ 单个 RPC/SQL 事务函数
```

第二种结构的前提是先把领域引擎保持为纯 TypeScript，并明确 Edge Runtime 的依赖、事务调用和错误语义。它是后续部署优化，不是本次必须完成的重写。

## 建议的实施顺序

### 阶段 A：先让当前 v0 可交付

- [ ] 建立 staging Supabase 项目，迁移可重复执行，发布脚本先迁移再发布。
- [ ] 完成真实邮箱 OTP、自然过期验证码、三端部署后 E2E 和 RLS 验收。
- [ ] 补健康检查、结构化错误日志、连接池/限流/TLS 配置、密钥扫描和回滚记录。
- [ ] 给 `Workspace`、snapshot、audit、receipt、notification 写出容量预算和保留策略。
- [ ] 先补 `admin_operations`、审计/通知分页和修剪，避免继续把历史数据塞回主 JSONB。
- [ ] 把 `ADMIN-US-217` 从 Backlog 推进到可验收状态。

### 阶段 B：把协作包变成真正可复用的模板能力

- [ ] 移除 collaboration 包对 `Asset*` 的直接依赖。
- [ ] 注入 domain adapter、schema version、记录级检查和字段/关系元数据。
- [ ] 抽象目标引用，保留默认 `shared` 作为兼容配置。
- [ ] 服务端生成或校验提交摘要，补充提交不可变性和迁移版本。
- [ ] 三端只消费通用协作契约；资产示例留在三端应用 domain 层。

### 阶段 C：按真实容量决定是否拆分表和迁移 Edge Function

- [ ] 用真实工作区规模测量命令耗时、锁等待、快照体积、数据库 WAL 和 Realtime 事件量。
- [ ] 按测量结果把 commits、PR、review、thread、notifications、audit 拆成表或事件流。
- [ ] 若部署成本仍是主要问题，再将命令入口迁移到 Edge Function，并用 RPC 保证跨表原子性。
- [ ] 迁移期间保留旧 API 和新 API 的兼容读模型，完成回滚演练后再切流。

## PR 验收标准

### 必须通过

- [x] `pnpm nx run rxdb-admin-template:requirements-check`
- [x] `pnpm nx run rxdb-admin-template:requirements-test`
- [x] `pnpm nx run admin-collaboration:lint`
- [x] `pnpm nx run admin-collaboration:build-server`
- [x] `pnpm nx run admin-collaboration:test`
- [x] `pnpm nx run admin-collaboration:test-integration`
- [ ] staging 真实邮箱 OTP 和自然过期验证码
- [ ] staging 三端完整协作 E2E 与 RLS 证据
- [ ] 迁移重复执行、回滚/前向修复和健康检查证据
- [ ] 容量预算、快照分页、回执/审计/通知保留策略

### 建议新增的自动化用例

- [ ] RLS 对匿名用户、已认证用户、跨团队和跨应用读取/写入的矩阵测试。
- [ ] 两个并发命令同时操作同一工作区时的确定性结果、回执和重试测试。
- [ ] 同一 `operationId` 的相同请求返回原结果，换参数请求被拒绝；清理回执后行为有明确契约。
- [ ] 连续追加大量评论、通知和审计后，snapshot 分页、TTL 和归档仍满足预算。
- [ ] migration 连续执行两次，publication、RLS、grant 和索引保持一致。
- [ ] 非资产 domain adapter 接入测试，证明协作包不依赖 `Asset*` 类型。

## 本次复验记录

本次只读评审在当前工作区执行了以下 Nx 目标，全部通过：

```text
rxdb-admin-template:requirements-check
rxdb-admin-template:requirements-test
admin-collaboration:lint
admin-collaboration:build-server
admin-collaboration:test
admin-collaboration:test-integration
```

这证明当前实现和已有本地门禁是可构建、可测试的；它不替代生产 Supabase、真实 SMTP、部署后 E2E 和长期运行容量验收。

## 最终意见

**可以继续做，但要调整目标表述和交付顺序：**

- 对“数据 PR + 审核 + 原子合并”的首版目标，当前领域设计是成立的，值得保留。
- 对“最小成本接入 Supabase”，当前实现应明确叫 **Supabase-backed custom collaboration service**；如果要做到 Supabase-only，再单独立项迁移 Edge Function。
- 对“可复用 Admin 模板”，必须先移除资产实体硬编码，否则每接一个业务域都要 fork 协作包。
- 对生产合入，先完成 `ADMIN-US-217`、容量护栏和真实环境证据；当前不建议把所有协作故事标记为 Done。

因此本 PR 的处理建议是：**批准当前本地协作闭环进入下一阶段开发，暂缓生产合入；先按阶段 A 完成交付闭环，再按真实容量决定阶段 B/C 的拆分深度。**

## 关联文档

- [现有代码评审](CODE-REVIEW-2026-11-17.md)
- [用户故事缺口分析](USER-STORY-GAP-2026-11-17.md)
- [协作包运行说明](packages/collaboration/README.md)
- [协作实现与验收记录](requirements/plans/collaboration-implementation.md)
- [生产部署与运维故事 ADMIN-US-217](requirements/stories/collaboration/ADMIN-US-217-production-deployment-operations.md)
- [协作共享契约](requirements/collaboration-contract.md)
