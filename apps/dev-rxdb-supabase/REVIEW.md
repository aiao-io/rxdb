# `dev-rxdb-supabase` 代码评审

## 结论

🔴 不通过。浏览器配置把任意 `VITE_SUPABASE_KEY` 当作可公开密钥，足以让 service-role/secret 因误配置直接进入前端产物；存储能力检测和 `.env` 解析也不可靠。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/dev-rxdb-supabase` 下 Angular 应用、Supabase/wa-sqlite 初始化、运行时配置、serve 脚本、测试和 Nx 配置
- 自动校验：本轮仅完成只读代码审查，未为该项目单独运行 `lint`、`build`、远端 Supabase 集成或自动测试
- 测试现状：已有运行时配置单测，但未覆盖 secret key 拒绝、SharedWorker 缺失和标准 `.env` 引号/注释语义

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| SUPABASE-001 | P1 | `src/app/runtime-config.ts:24` | `readSupabaseConfig()` 只校验 `VITE_SUPABASE_KEY` 非空，不区分 anon/publishable 与 service-role/secret。所有 `VITE_*` 值都会进入公开浏览器环境，一次常见的变量误配就会把绕过 RLS 的高权限凭据交给任何访问者。 | 公开配置只接受命名明确的 anon/publishable key；显式拒绝 secret/service-role 形式，服务端密钥禁止使用 `VITE_` 前缀。增加构建产物密钥扫描和错误密钥回归测试。 |
| SUPABASE-002 | P2 | `src/app/setup_rxdb_wa-sqlite.ts:40` | OPFS 不可用时无条件实例化 `SharedWorker`。不支持 SharedWorker 的浏览器会在 adapter 工厂内直接抛 `ReferenceError`，能力错误既不明确，也没有在进入初始化前被报告。 | 在构造 worker 前显式检测 OPFS、Worker、SharedWorker 与所需隔离条件，选择受支持的明确路径；无兼容后端时返回可诊断的 unsupported 错误，不要靠构造器崩溃。 |
| SUPABASE-003 | P2 | `scripts/serve.mjs:15` | 手写 `.env` 解析器只是按首个 `=` 切分，不处理常见的引号、转义和行尾注释。合法 `.env` 可能把引号或注释拼进 URL/key，导致远端模式误报不可达或携带错误凭据。 | 使用 Node 标准能力或成熟 dotenv 解析器，删除自制语法子集；补充 quoted value、内嵌 `=`、空格和行尾注释测试。 |

## 其余观察与测试缺口

- `src/app/app.config.ts:47` 已通过应用初始化器执行 `connect('wa-sqlite')`；本项目不存在“本地 adapter 未连接”的问题，不能误报。
- 本地 CRUD 不能证明远端同步、冲突处理或 RLS 正确，远端路径需要独立集成测试和隔离数据。
- 浏览器矩阵至少要覆盖 OPFS 可用、仅 SharedWorker 可用和两者都不可用三种能力组合。

## 验收条件

- 前端只接受可公开的 anon/publishable key；service-role/secret 无法通过配置校验，且构建产物扫描不含高权限凭据。
- wa-sqlite 在每种浏览器能力组合下要么成功连接，要么返回明确 unsupported 错误，不得抛未定义全局变量。
- `.env` 使用标准解析语义，remote serve 对引号、注释和包含 `=` 的值有回归测试。
- 修复后执行 `pnpm nx lint dev-rxdb-supabase`、`pnpm nx build dev-rxdb-supabase`，并在隔离 Supabase 环境完成远端连接与同步 smoke test。
