# Aiao Media 应用组合与目录治理

> 本文定义 Aiao Media 在当前 Nx 工作区中的应用边界、目录归属、私有包命名和依赖方向。
> 本文是架构规划，不代表目录迁移已经完成；迁移完成前，当前实现仍以 `apps/aiao-media/` 为准。

## 决策

Aiao Media 作为仓库根目录下的产品组存在：

```text
rxdb-media/
├── apps/                       # RxDB 平台 demo 与公共示例
├── packages/                   # @aiao/* 公共包
├── modules/                    # 现有内部模块
└── aiao-media/                 # Aiao Media 产品组
```

`aiao-media/` 是产品目录，不创建第二个 Nx workspace。仓库继续只有一个 Nx 根，所有产品应用和私有包都加入现有项目图。这样可以继续直接依赖 `@aiao/*` RxDB 包，并让 `nx affected` 正确计算产品应用、私有包和平台包之间的影响关系。

Aiao Media 内部采用 Nx 多项目组合：

```text
aiao-media/
├── AGENTS.md
├── requirements/               # MEDIA-US-* 产品需求的最终归属
├── deploy/                     # web/admin/api 的部署配置
├── scripts/                    # 产品级脚本
├── apps/
│   ├── web/                    # 普通用户创作端
│   ├── admin/                  # 独立后台管理端
│   ├── api/                    # Cloudflare Worker 与产品 API
│   ├── web-e2e/                # 用户端浏览器验收
│   └── admin-e2e/              # 后台浏览器验收
└── packages/
    ├── domain/                 # 领域模型、schema、纯业务校验
    └── api-contracts/          # web/admin/api 共用的 DTO 与接口契约
```

未来若需要把 Aiao Media 拆成独立 Git 仓库，应整体迁移 `aiao-media/`、其产品应用和私有包，并另行评审 RxDB 依赖的发布与版本策略。本阶段不在现有仓库中嵌套第二个 Nx workspace。

## Nx 项目命名

目录名表达归属，Nx project name 表达可执行项目，npm package name 表达可引用边界：

| 目录 | Nx project | npm package | 类型 |
| --- | --- | --- | --- |
| `aiao-media/apps/web` | `aiao-media-web` | `@aiao-media/web` 或 private app package | application |
| `aiao-media/apps/admin` | `aiao-media-admin` | `@aiao-media/admin` 或 private app package | application |
| `aiao-media/apps/api` | `aiao-media-api` | `@aiao-media/api` 或 private app package | application |
| `aiao-media/apps/web-e2e` | `aiao-media-web-e2e` | private | e2e application |
| `aiao-media/apps/admin-e2e` | `aiao-media-admin-e2e` | private | e2e application |
| `aiao-media/packages/domain` | `aiao-media-domain` | `@aiao-media/domain` | private library |
| `aiao-media/packages/api-contracts` | `aiao-media-api-contracts` | `@aiao-media/api-contracts` | private library |

私有产品包统一使用 `@aiao-media/*` 作用域，不使用 `@aiao/*`。`@aiao/*` 继续表示 RxDB 平台公共包。私有包默认不进入公开发布流程，不进入公共 API baseline；如果未来需要仓外消费，再单独评审发布范围和版本策略。

只有跨应用复用的能力才创建产品包。应用内部的页面、状态、API facade、适配器和测试夹具留在对应 `apps/*` 中，不为了目录整齐把每个文件夹都包装成 npm 包。

## 应用边界

### `aiao-media-web`

面向普通用户的创作端，负责：

- 本地优先的工作区、草稿、图片和备份；
- 提示词、生成任务、图片库和供应商配置；
- 用户账号、同步目标和用户可见设置；
- 只读取公开模板和公开供应商策略；
- Tauri/Web 的本地后端适配。

`web` 不再承载后台管理页面、跨用户查询、管理员授权或服务端 admin key。`local-data/` 属于 web 私有能力，不下沉到产品公共包。

### `aiao-media-admin`

独立的后台管理 SPA，建议部署到 `admin.aiao.io`，负责：

- 管理员登录和会话状态；
- 用户列表、详情、封禁与解禁；
- 模板草稿、校验、发布与撤回；
- 供应商公共策略和生效版本；
- 已上报任务、来源明确的用量和审计记录；
- 后台页面级路由、筛选、分页、错误和操作确认。

后台不能读取用户浏览器的 OPFS、本机路径、供应商 Key、未上报任务或未授权的私有图片。后台页面只通过产品 API 访问服务端数据。

通用布局、偏好抽屉、TabBar、命令面板等能力可以复用 `@aiao/rxdb-admin-angular`。用户管理、模板发布、供应商策略、用量和审计属于 Aiao Media 业务页面，必须留在 `aiao-media/apps/admin`。

### `aiao-media-api`

独立的 Cloudflare Worker/API 项目，负责：

- Supabase JWT 校验；
- 管理员成员资格和服务端授权；
- `/api/admin/*` 管理接口；
- `/api/templates`、`/api/provider-policies` 等公开读取接口；
- relay、平台任务、用量和产品同步接口；
- 管理写操作的 revision/CAS、审计和服务端 secret 使用。

浏览器构建产物不得包含 service role key。前端隐藏入口、localStorage、`user_metadata`、客户端 owner 字段和过期角色信息都不能替代 API 的服务端授权。

API 应按领域拆分路由和服务，不继续把所有管理逻辑堆在单个 `admin-api.ts` 中：

```text
aiao-media/apps/api/
└── src/
    ├── worker.ts
    ├── http/
    ├── auth/
    ├── admin/
    │   ├── users.ts
    │   ├── content.ts
    │   ├── provider-policies.ts
    │   ├── reports.ts
    │   └── audit.ts
    ├── relay/
    └── platform/
```

## 私有包边界

### `@aiao-media/domain`

放与框架无关的产品领域能力：

- 媒体工作、模板、供应商策略和任务的领域类型；
- schema、字段约束和纯函数校验；
- 不依赖 Angular、DOM、localStorage 或具体 HTTP 实现的业务规则。

领域包可以依赖明确批准的 RxDB 核心类型，但不能反向依赖任何 Aiao Media 应用。

### `@aiao-media/api-contracts`

放 `web/admin/api` 之间共享的接口契约：

- request/response DTO；
- 管理会话、用户、内容、策略、任务、用量和审计类型；
- API 错误码和分页/筛选契约；
- 公开模板和供应商策略的读取契约；
- 版本化和兼容性校验。

这个包不包含 fetch、Supabase client、Angular service 或 Worker secret。浏览器 API client 留在 `apps/admin` 或 `apps/web`，服务端 handler 留在 `apps/api`。

推荐依赖方向：

```text
web   ───────┐
admin ────────┼──> @aiao-media/api-contracts
api   ───────┘              │
                            └──> @aiao-media/domain
```

必须禁止：

```text
admin -> web/src/*
api -> admin/src/*
domain -> 任意 apps/*
api-contracts -> Angular / DOM / localStorage
web -> admin 业务组件
```

## 部署边界

目标部署关系：

```text
app.aiao.io       -> aiao-media-web
admin.aiao.io     -> aiao-media-admin
api.aiao.io       -> aiao-media-api
```

`web` 和 `admin` 可以使用同一个 Supabase Auth 项目，但管理员资格只由 `api` 服务端维护和判断。后台的服务端边界、审计、数据来源和隐私限制继续服从 [MEDIA-US-203 跨用户业务后台](../apps/aiao-media/requirements/stories/account/MEDIA-US-203-business-admin.md)。

用户端旧 `/admin` 入口在迁移期保留为外部跳转，指向 `admin.aiao.io`，以兼容已有书签。跳转不承担授权，真正的授权仍由 `api` 完成。

## 当前代码到目标目录

当前实现仍在 `apps/aiao-media/`，迁移时按以下映射执行：

| 当前路径 | 目标路径 | 处理方式 |
| --- | --- | --- |
| `apps/aiao-media/` | `aiao-media/apps/web/` | 整体迁移用户端，先保持行为兼容 |
| `apps/aiao-media-e2e/` | `aiao-media/apps/web-e2e/` | 跟随 web 迁移，保留验收入口 |
| `apps/aiao-media/server/cloudflare/` | `aiao-media/apps/api/src/` | 独立 Worker/API 项目 |
| `apps/aiao-media/scripts/` | `aiao-media/scripts/` 或 `aiao-media/apps/api/scripts/` | 按是否服务端专属拆分 |
| `apps/aiao-media/requirements/` | `aiao-media/requirements/` | 产品需求继续使用 `MEDIA-US-*` |
| `apps/aiao-media/src/local-data/` | `aiao-media/apps/web/src/local-data/` | 保留为 web 私有能力 |
| `apps/aiao-media/src/app/admin-console.*` | `aiao-media/apps/admin/src/app/features/` | 从 web 移除，按业务 feature 拆分 |
| `apps/aiao-media/src/contracts/` | web 私有或 `@aiao-media/api-contracts` | 按消费者拆分，禁止整目录复制 |

现有 `apps/rxdb-admin-template-*` 和 `packages/rxdb-admin-*` 仍属于 RxDB 平台/模板体系，不随 Aiao Media 产品目录移动。它们只能提供通用能力，不能成为 Aiao Media 业务需求的归属地。

## Nx 与包管理配置

迁移到产品组后，根 `pnpm-workspace.yaml` 需要纳入：

```yaml
packages:
  - 'aiao-media/apps/*'
  - 'aiao-media/packages/*'
```

产品私有包使用独立的 `package.json` 和显式 `project.json`。根 `tsconfig.base.json` 增加 `@aiao-media/*` 的 source path，应用通过包名引用，不通过跨应用相对路径引用源码。

建议使用以下 Nx tags：

```text
scope:aiao-media
layer:ui
layer:server
layer:domain
layer:contracts
type:app
type:lib
type:e2e
```

依赖边界应至少保证：

- `web`、`admin`、`api` 可以依赖 `scope:aiao-media` 的 domain/contracts；
- `domain`、`api-contracts` 不能依赖应用；
- `admin` 不能依赖 `web`；
- `api` 不能依赖 Angular 页面；
- Aiao Media 私有包与其领域功能在同一 PR 中统一评审、验证和合入。

## 迁移闸门

目录移动不等于迁移完成。每个阶段至少通过以下检查：

1. `pnpm nx show projects` 能看到 `aiao-media-web`、`aiao-media-admin`、`aiao-media-api` 及对应 e2e 项目。
2. `web` 构建产物不再包含后台业务组件。
3. `admin` 可以独立启动、刷新路由并完成匿名/普通用户/管理员三类访问验证。
4. `api` 的管理接口继续验证服务端管理员资格，浏览器产物无 service role key。
5. 旧 `/admin` 入口可以跳转到独立后台，已有用户书签不直接失效。
6. web、admin、api 的 typecheck、lint、单元测试和相关浏览器验收通过。
7. `nx affected` 能根据私有包变化只选择受影响的应用和测试。
8. `MEDIA-US-203` 的既有数据边界、审计、CAS 和“未上报数据不可见”验收不因拆应用而放宽。

在上述闸门全部通过前，不删除当前 `apps/aiao-media` 的管理入口，也不把 `MEDIA-US-203` 标记为结构迁移完成。
