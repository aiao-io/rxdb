# Implementation Plan: Supabase-first 后台与 RxDB 同步架构

**Branch**: `013-supabase-rxdb-backend` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-supabase-rxdb-backend/spec.md`

## Summary

本次实施把后台能力拆成三个安全层：普通业务表、受保护 view 和调用者身份明确的 RPC 直接由 Admin/后台 RxDB 访问；Auth Admin API、封禁/解禁和绕过 RLS 的 service role 操作只由 Supabase Edge Function 执行；长时间生成任务先保留 Durable Object，再用 PGMQ 做可回退 PoC。

实现顺序是：

1. 统一 Admin Supabase Auth 和普通业务直连，先固定权限契约；
2. 建立后台 Node RxDB 同步节点，复用现有 Supabase adapter、Realtime、history 和 working-tree；
3. 将 Admin 配置迁移到共享领域实体和 `rxdb-model-angular`；
4. 将 branch/working-tree/commit 投影成可同步的领域实体，并由原子 apply RPC 应用；
5. 建立 PGMQ consumer PoC，验证故障恢复后再决定是否迁移生产任务。

## Technical Context

**Language/Version**: TypeScript 6.0+、Node 26+、Angular 22+、PostgreSQL/Supabase SQL。

**Primary Dependencies**: Supabase Auth/PostgREST/Storage/Edge Functions、`@supabase/supabase-js`、`@aiao/rxdb`、`@aiao/rxdb-adapter-supabase`、`@aiao/rxdb-plugin-sync`、`@aiao/rxdb-plugin-history`、`@aiao/rxdb-plugin-working-tree`、`@aiao/rxdb-model`、`@aiao/rxdb-model-angular`、Nx 23+、pnpm 10。

**Storage**: Supabase PostgreSQL + RLS + `rxdb_change`/`rxdb_branch`；后台本地 PGlite/SQLite；私有 Supabase Storage；当前生成任务仍使用 Durable Object SQLite + R2，PGMQ PoC 使用 Supabase PGMQ。

**Testing**: Vitest；Node `node:test`；Playwright；本地 Supabase/PostgreSQL integration；Nx requirements-check、lint、typecheck、test、build。按仓库宪法，行为改动遵守红-绿-重构，公共包覆盖率不低于 80%，核心包不低于 90%。

**Target Platform**: Angular Admin 浏览器、Supabase Edge Functions、Node 后台同步/消费者、Cloudflare Worker/Durable Object 当前生产任务链路。

**Project Type**: Nx monorepo，包含独立 Angular Admin、Cloudflare/Node API、Supabase migrations/functions 和 RxDB 公共包。

**Performance Goals**:

- 普通 Admin 业务查询不再通过 Cloudflare 代理；常规列表和编辑请求在本地部署目标中 p95 ≤ 500ms，不含冷启动。
- 后台同步重启后能够在 30 秒内恢复游标并开始处理待同步变更。
- 单个配置 commit apply 使用一次数据库事务；重复 apply 在 p95 ≤ 200ms 内返回既有结果。
- PGMQ PoC 覆盖当前 180 秒 provider 超时、210 秒任务看门狗和 visibility timeout 边界，不承诺 Edge Function 承载长任务。

**Constraints**:

- 浏览器和普通同步节点不能持有 secret/service role；Auth Admin、封禁和绕过 RLS 必须经过 Edge Function。
- 普通 RPC 使用 `auth.uid()`/已验证身份，不信任客户端 actor/user ID。
- 现有图片 Storage、积分、任务状态、结果取回和双区域契约不能破坏。
- RxDB 内部系统表不直接纳入普通 Supabase 同步；提交使用领域 projection。
- PGMQ PoC 失败时 Durable Object 必须继续可用；不能先删除当前实现。
- `packages/*` TS strict、零 ESLint warning、公共导出有 TSDoc；新增复杂度需要记录。

**Scale/Scope**: 5 个用户故事，17 条功能需求，7 条成功标准；覆盖 Admin、后台同步节点、配置提交工作流和队列 PoC，不包含完整 RxDB commit graph sync 或 PGMQ 生产切换。

## Constitution Check

_GATE: Must pass before Phase 0 research._

| 原则                        | 计划约束                                                                                                                                     | 结果                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Code Quality                | 新增公共实体和同步 API 保持 strict、TSDoc、浅层控制流；Admin 私有代码也必须零 lint warning                                                   | PASS                             |
| Testing Standards           | 先补失败的权限、同步恢复、幂等和 projection 测试；通过 affected/包级 test、coverage 和真实本地 Supabase 验证                                 | PASS                             |
| User Experience Consistency | `@aiao/rxdb-model` 领域实体和公共 API保持跨框架可复用；Aiao Media Admin 当前只实现 Angular 组件                                              | PASS with explicit product scope |
| Performance                 | 普通业务直连减少代理往返；commit apply 单事务；后台同步和 PGMQ consumer 有明确超时/积压指标                                                  | PASS                             |
| Never break userspace       | 保留 `/api/admin/*` 兼容窗口和 Durable Object 回退；图片 Storage、积分、任务结果协议不变                                                     | PASS                             |
| Complexity                  | Edge Function、backend RxDB、commit projection 和 PGMQ consumer 都是新增边界，但分别关闭安全、同步和队列故障问题；不引入直接同步 RxDB 系统表 | JUSTIFIED                        |

## Project Structure

### Documentation (this feature)

```text
specs/001-supabase-rxdb-backend/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── admin-edge-function.md
│   ├── config-apply-rpc.md
│   └── pgmq-message.json
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
aiao-media/
├── apps/
│   ├── admin/src/app/
│   │   ├── app.ts                         # Admin Auth/session 迁移
│   │   ├── product-client.ts              # 普通 Supabase/RPC 和 Edge 调用
│   │   ├── admin-console.ts               # 配置 UI 迁移到 RxDB/rxdb-model
│   │   └── *.spec.ts                      # Admin 行为测试
│   ├── api/src/
│   │   ├── admin-api.ts                   # 迁移期间兼容入口
│   │   ├── backend-rxdb/                  # 后台同步节点装配
│   │   ├── pgmq-consumer.ts               # PGMQ PoC consumer
│   │   └── *.test.ts                      # Node/API/PoC 测试
│   └── supabase/functions/admin-api/      # 目标 Supabase Edge Function
├── infra/supabase/migrations/
│   ├── 0xx-admin-direct-boundary.sql
│   ├── 0xx-config-commit-projection.sql
│   └── 0xx-pgmq-generation.sql
└── packages/
    ├── domain/src/                        # 共享 Aiao Media 实体/schema
    ├── rxdb-adapter-supabase/
    ├── rxdb-plugin-sync/
    ├── rxdb-plugin-working-tree/
    ├── rxdb-model/
    └── rxdb-model-angular/
```

**Structure Decision**: 复用现有 Nx workspace 的 Admin、API、Supabase migrations 和 RxDB 公共包。新能力按领域放在 `aiao-media` 私有应用和 `packages/domain`，不把业务代码塞进 RxDB 基础包；只有通用同步、模型和工作树协议需要公共包改动时才进入 `packages/*`。

## Phase 0: Research outputs

- [research.md](research.md) 固化直接 Supabase/Edge Function、后台 RxDB、commit projection 和 PGMQ 的决策。
- [data-model.md](data-model.md) 固化实体、状态转换和幂等约束。
- [contracts/](contracts/) 固化 Edge Function、apply RPC 和 PGMQ 消息契约。

## Phase 1: Design outputs

- Supabase migrations：管理员直接调用权限、commit projection、apply RPC、PGMQ PoC queue。
- Admin contracts：Auth session、普通 RPC、Edge Function 请求/错误响应。
- Backend RxDB assembly：普通 JWT、本地 adapter、Supabase remote adapter、sync lifecycle。
- `rxdb-model` entity metadata：模板、策略、平台模型和配置关系。
- PGMQ consumer：最小消息、visibility timeout、task CAS、结果唯一性和回退开关。

## Constitution Check (post-design)

| 检查项                                                             | 结果                    |
| ------------------------------------------------------------------ | ----------------------- |
| 没有把 service role 放进浏览器或普通 sync 节点                     | PASS                    |
| 普通 RPC 身份来自已验证会话                                        | PASS                    |
| PGMQ 不替代任务状态、积分和结果 Storage                            | PASS                    |
| RxDB 系统表不直接成为 Supabase 公共同步契约                        | PASS                    |
| 当前 Durable Object 有回退路径                                     | PASS                    |
| 新增公共包 API 的 TSDoc、三框架对称和 coverage 任务已纳入 tasks.md | PENDING TASK GENERATION |

## Complexity Tracking

| Violation / complexity          | Why needed                                           | Simpler alternative rejected because                            |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Supabase Edge Function 特权边界 | Auth Admin 和 service role 不能由浏览器执行          | 所有操作继续由 Worker 代理会保留重复业务 API 和 Cloudflare 依赖 |
| Backend RxDB sync node          | 后台必须具备与前端一致的 local-first、重启和冲突语义 | 手写后台 CRUD/cache 无法复用同步游标、Realtime 和冲突协议       |
| Domain commit projection        | RxDB 内部 commit 系统表不属于普通同步范围            | 直接同步系统表会泄漏本地存储实现并破坏版本兼容                  |
| PGMQ consumer PoC               | 验证多消费者/积压/重试是否值得切换                   | 未验证故障语义就切生产会破坏当前任务恢复协议                    |
