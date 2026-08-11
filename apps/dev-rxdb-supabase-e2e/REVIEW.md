# `dev-rxdb-supabase-e2e` 代码评审

## 结论

🔴 不通过。项目叫 Supabase E2E，实际只启动 local 模式并验证本地 UI；同步、冲突和 RLS 一条都没测，名称和质量门禁都在制造安全感。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/dev-rxdb-supabase-e2e` 下 Playwright 用例、运行配置和 Nx E2E 配置
- 自动校验：本轮仅完成只读代码审查，未单独启动本地服务、Supabase 或执行 Playwright
- 测试现状：1 个 spec 文件、3 个用例，全部是单浏览器本地渲染/CRUD/游标加载；远端同步契约覆盖为 0

## 问题

| ID               | 级别    | 位置                      | 问题与影响                                                                                                                                                                                | 建议                                                                                                                                    |
| ---------------- | ------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SUPABASE-E2E-001 | P1      | `src/home.spec.ts:7`      | 整个 suite 只验证 home、local Todo CRUD 和游标分页，配置又固定启动 `serve-local`。它从未连接 Supabase，也不验证 push/pull、断线重连、冲突、用户隔离或 RLS；核心集成坏掉时该项目仍会全绿。 | 建立隔离 Supabase 测试实例，使用至少两个浏览器上下文验证双向同步、冲突收敛、重连补偿和跨用户 RLS 拒绝；测试结束按唯一命名空间清理数据。 |
| SUPABASE-E2E-002 | ✅ 已修 | `playwright.config.ts:6`  | 设置 `BASE_URL` 只改变 Playwright 导航地址，`webServer` 仍无条件启动并等待 `localhost:8312`。针对已部署环境的 CI 仍会拉起无关本地服务，甚至因本地端口不可用而在访问远端前失败。           | 有 `BASE_URL` 时 `webServer` 置 `undefined`，本地隔离守卫同时跳过。                                                                     |
| SUPABASE-E2E-003 | ✅ 已修 | `playwright.config.ts:35` | `reuseExistingServer: true` 在 CI 也生效，测试可能复用遗留、错误版本或错误配置的 8312 服务，结果不可复现。                                                                                | 改为 `!isCI`；端口挪到 8313 避开旧 `serve-local` 残留进程（`@nx/web` file-server 端口被占时会静默换端口）。                             |

## 补记（2026-07-25）

评审当时判断「从未连接 Supabase」，**事实相反**：`serve-local` 用空串表达本地模式，而空串是唯一撑不过
Nx/dotenv 往返的取值，工作区 `.env` 的值胜出，套件一直在跑真实双向同步 —— 这正是 Nx 把该任务标记为
flaky 的原因（本地 `.env` 指向的 Supabase 一旦活着，绝对数量断言必挂）。

本次修复的选择是**把 local-only 从「碰巧」变成「强制」**：e2e 改服务构建产物，产物在构建期把
`import.meta.env` 定死为无 Supabase 配置；`src/home.spec.ts` 加了自动 fixture，任何越过 baseURL
的 http(s) 请求都会让用例失败。

因此 SUPABASE-E2E-001 **不因本次修复而关闭**：这三条用例被明确定位为确定性的本地 UI smoke，真实的
push/pull、冲突收敛、重连补偿与 RLS 覆盖仍然为 0，需要独立的、带隔离 Supabase 实例的套件来补。

## 其余观察与测试缺口

- 现有 local CRUD 和 cursor 用例可以保留为 UI smoke，但不能承担 Supabase 集成验收。
- 只有 Chromium 项目；涉及存储后端与 worker 能力时，至少还需要一个能力不同的浏览器运行时或明确的支持范围。
- 远端测试必须避免共享固定用户和数据库名，否则并发 CI 会互相污染并制造偶发失败。

## 验收条件

- E2E 必须真实经过 Supabase 网络链路，并覆盖 push、pull、冲突、重连、RLS 允许/拒绝和数据隔离。
- `BASE_URL`、local、remote 三种模式互斥；远端 URL 模式不会启动或等待 localhost。
- CI 不复用已有服务器，测试数据按 run 隔离且可可靠清理。
- 在隔离环境执行 `pnpm nx e2e dev-rxdb-supabase-e2e`，失败时保留 trace、服务日志与 Supabase 请求证据。
