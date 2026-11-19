# US-225 隔离栈验证记录

对应故事见 [US-225 Supabase 日志同步的访问底线](US-225-supabase-sync-protocol-access-baseline.md)。

2026-11-19，本检出位的隔离测试栈（`pnpm nx run rxdb-adapter-supabase:test-env`）：

- 红：新用例先在旧版 01～04 上运行，套件准备段因缺 `rxdb_branch_owner` 整体失败；加载新版 01、02、04 与生产权限脚本后 `sql-security-regressions` 44 个用例加单事务汇总全过。
- 迁移中暴露并修正的依赖：`branch-search-path` 与 `pagination-truncation`（SUPA-005）原先以客户端身份直写 `rxdb_branch` 造数据，改走 service_role；三个桩客户端补 `realtime.setAuth`。
- 经 HTTP 复核：anon key 调 `rxdb_pull_changes` 得 `42501 permission denied for function rxdb_pull_changes`；匿名注册拿到的令牌是 `role=authenticated`、`is_anonymous=true`。
- 订阅私有频道必须先 `realtime.setAuth()`：不调用时 Realtime 日志里的令牌是 anon key 本身（`iss=supabase-demo`），已登录客户端也被拒。

## 验收时的测试结果

- **AC#12** 真栈 `realtime-notifications.spec.ts`「另一台设备推送后可拉取计数增加，拉取后本地数据一致」；`handle-supabase-change.spec.ts` 24 个处理器用例
- **AC#13** `pnpm nx test rxdb-adapter-supabase`：47 个文件、677 个用例全过，语句 96.77% / 分支 89.82% / 函数 98.36% / 行 97.79%
- **AC#14** `dev-rxdb-supabase` 单测 54 个（含 `supabase-session.spec.ts`）；对隔离栈直跑 `remote-sync.spec.ts` 4 个用例全过（两个浏览器上下文是两个匿名用户）
