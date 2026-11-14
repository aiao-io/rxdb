---
id: MODEL-US-004
title: 本地开发环境与开发导航
status: Done
priority: Medium
epic: MODEL-EPIC-002
created: 2026-11-12
updated: 2026-11-12
tags: [tooling, nx, dev-experience]
dependsOn: [MODEL-US-003]
capabilities: []
---

# 用户故事：本地开发环境与开发导航

## 作为/我想要/以便

**作为** 模型设计器的开发者
**我想要** 在仓库根执行 `pnpm nx dev aiao-model-design`，就拉起登录要用的本地 Supabase、本地 Worker 与支持热更新的 Web，按配置接入智能体，并打开一页开发导航
**以便** 不用自己准备 Supabase 项目就能用测试账号登录、联调 AI，服务入口、账号与连接信息一页可查。

## 范围边界

### In Scope

- 产品根的 `dev` 目标：检查固定端口 → 拉起本地 Supabase 并同步角色密码 → 准备测试账号与本地 Worker 配置 → 启动 Worker 与 Web 开发服务器 → 全部就绪后打开开发导航。
- 本地 Supabase 放在产品根 `infra/supabase/`，只起登录需要的 Postgres、GoTrue 与 Kong：端口固定在已提交的 `ports.env`，凭据首次运行时随机生成到私有 `.env`；关闭注册，测试账号经管理接口创建并确认。
- 按 `apps/api/.dev.vars` 的密钥类型接入智能体：未配置时禁用；开发环境密钥顺带启动 `trigger dev`；其他环境密钥使用实例上已部署的版本（[D-10](../../decisions.md#d-10本地开发环境)）。
- 开发导航由绑定 127.0.0.1 的本地 Worker 在根路径提供：服务入口、测试账号、AI 接入状态与数据库连接，可一键复制，不含服务端密钥。
- 安全门禁把本地 Supabase 的凭据文件纳入 web 构建产物的密钥比对。
- web 开发服务器关闭预打包：`@trigger.dev/sdk` 只装在 web 自己的依赖里，从仓库根解析不到，原来的 `serve` 打开设计器即报模块错误。

### Out of Scope

- 自建 Trigger.dev 实例的拉起与初始化：实例按 README 的部署说明另行搭建，`nx dev` 只连接已有实例。
- Supabase Studio、注册邮件、PostgREST 与 Realtime：设计器只用 Auth 登录，需要时再加。
- 用本地 GoTrue 的登录代替 MODEL-US-002 #10 的真实账号复核。

## 验收标准

| #   | 前置条件                        | 操作                                 | 预期结果                                                                                                                                                                                                                            | 状态 |
| --- | ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Web 或 Worker 的固定端口被占用  | 执行 `nx dev`                        | 报出服务名与地址后退出，不换端口，也不停掉占用者                                                                                                                                                                                    | ✅   |
| 2   | 首次运行                        | 执行 `supabase-up`                   | 生成仅本人可读的随机凭据，拉起 Postgres、GoTrue 与 Kong；Kong 只把 `/auth/v1/` 转给 GoTrue 并校验 apikey，注册关闭；再次运行沿用凭据与数据卷                                                                                        | ✅   |
| 3   | 本地 Supabase 就绪              | 准备测试账号                         | 两个账号存在且邮箱已确认；再次启动保留账号 ID、恢复默认密码；只写本机 127.0.0.1                                                                                                                                                     | ✅   |
| 4   | 准备完成                        | 查看生成的文件                       | Worker 的配置、密钥与导航页只写在忽略的 `apps/api/.wrangler/local-dev/`（密钥与导航页权限 600），不改 `.dev.vars` 与 `wrangler.jsonc`；导航页不含 JWT secret、service role key、anon key 与 Trigger.dev 密钥                        | ✅   |
| 5   | `.dev.vars` 的 Trigger.dev 配置 | 执行 `nx dev`                        | 未配置时 AI 入口禁用；生产等环境密钥使用已部署的智能体；开发环境密钥启动 `trigger dev`，缺项目 ref 或 `.env.agent` 时在启动服务前报错退出；只配一半、地址无效或密钥不是环境密钥时报错                                               | ✅   |
| 6   | 全部服务就绪                    | 观察 `nx dev`                        | 自动打开导航页一次；`AIAO_DEV_OPEN=false` 时不打开                                                                                                                                                                                  | ✅   |
| 7   | 本机 Docker                     | 执行 `pnpm nx dev aiao-model-design` | 导航页列出设计器、登录页、Worker、Supabase Auth 与 Trigger.dev 入口、测试账号和数据库连接，复制可用，手机宽度无横向滚动；设计器正常渲染；测试账号登录后 `/bff/auth/session` 返回该用户，错误密码被拒；改 Web 源码后页面自动重新加载 | ✅   |
| 8   | 本机自建实例，生产环境密钥      | 登录后申请 AI 会话                   | 导航页显示已部署版本与实例地址，Worker 为本人的会话签发令牌                                                                                                                                                                         | ✅   |
| 9   | 本机自建实例，开发环境密钥      | 执行 `nx dev`                        | `dev-agent` 启动 `trigger dev` 并连上实例                                                                                                                                                                                           | ✅   |
| 10  | 运行中                          | 停止 `nx dev`                        | 应用进程退出、端口释放；Supabase 容器继续运行并保留数据                                                                                                                                                                             | ✅   |

验收证据：#1～6 由 `aiao-model-design:dev-test` 的 Node 测试覆盖，#2～5、#7～10 有本机真实运行记录，汇总见[验收台账](../../verification-report.md#本地开发环境)。

## 技术笔记

做法照 aiao-media 的 `nx dev`：`dev-config` 把本地 Worker 的静态资源目录换成生成的导航页，Web 走 Angular 开发服务器，把 `/api/**`、`/bff/**` 代理给 Worker，所以不需要先构建 web。Nx 的持续任务按 `readyWhen` 串起来：Worker 的 `/health` 就绪后才启动 Web，Web 就绪后才打开导航页。

Kong 的声明式配置作为环境变量传入，必须折成一行：Kong 把配置落到按行读取的 `.kong_env`，多行取值只剩第一行，结果是没有任何路由。凭据重新生成而数据卷保留时，`supabase-up` 用容器里免密的 `supabase_admin` 把 `postgres`、`supabase_admin`、`supabase_auth_admin` 的密码同步成新值。

智能体任务在开发环境密钥时用 agent 包自己解析到的 trigger CLI 运行 `trigger dev start`，带 `--api-url`（与 Worker 同一个实例）、`--profile self-hosted`，并跳过升级检查与安装向导，避免在任务窗格里停下来等输入或改依赖；其余模式只报告状态并保持运行，Nx 的持续任务不能提前退出。

## 实现文件

- `aiao-model-design/project.json` — `dev`、`dev-ports`、`dev-config`、`dev-agent`、`dev-supabase`、`dev-test` 与 `supabase-*` 目标；`verify` 增加产品根的 `lint` 与 `dev-test`。
- `aiao-model-design/apps/web/project.json`、`apps/api/project.json` — 固定端口的 Web 开发服务器（关闭预打包）与读取 local-dev 配置的 Worker。
- `aiao-model-design/scripts/dev/` — 端口检查、测试账号、智能体接入、准备配置、导航页模板与自动打开浏览器，各带 `*.spec.mjs`。
- `aiao-model-design/scripts/supabase/supabase-local.mjs` — 本地 Supabase 的初始化、启动、停止与日志。
- `aiao-model-design/infra/supabase/` — compose 文件、固定端口、凭据模板与角色初始化 SQL。
- `aiao-model-design/scripts/check-web-secrets.mjs` — 比对本地 Supabase 凭据。

## References

- [D-10](../../decisions.md#d-10本地开发环境)
- [MODEL-EPIC-002](../../epics/MODEL-EPIC-002.md)
- 参考实现：`codex/aiao-media-incubation` 分支的 `aiao-media/scripts/dev/`
