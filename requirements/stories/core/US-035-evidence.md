# US-035 验证记录

对应故事见 [US-035 每个身份一个本地库](US-035-identity-bound-local-database.md)。

2026-11-24，基于 `b1bc4412` 的工作区，本检出位的隔离测试栈（`pnpm nx run rxdb-adapter-supabase:test-env`，Kong 端口 55001）。

## 补齐的验收用例

- **AC#3**：真栈「同一个用户刷新令牌之后照常同步」。会话令牌换成同一个 `sub`、签名与过期时间都不同的新令牌，推送与拉取照常；本地同步插件的绑定只有 A 一条，迁移表里以 A 的身份键结尾的水位行只有一条。
- **AC#4**：真栈新增「在线与离线」用例。在线：B 的会话先连上远端（`connect('supabase')` 走一遍 RLS 自检与实时订阅），`callerIdentity()` 报的就是 B；离线：远端指向本机不监听的 `http://127.0.0.1:9`。两次 `connect('wa-sqlite')` 都抛 `RxDBIdentityMismatchError`，仓储读在 500 ms 内没有交出行。A 再打开时行还在；对照：同一个读在 500 ms 内拿到 A 的行。实现已在，首跑即绿。
- **AC#5**：真栈新增用例。库名按 anon 算、库绑定 anon；登录用户仍打开这个库被拒；改按登录用户算库名之后推送与拉取照常。首跑即绿。
- **AC#7**：真栈用例先红。A 的拉取在 `pullChanges` 返回之后被闸住；`destroy()` 完成、B 的库打开、闸放开之后，A 的拉取既不成功也不失败，一直悬着（它在等一个已经断开的本地适配器）。修复：`getLocalSystemRepositories` / `getRemoteSystemRepositories` 接受「这一轮连接结束」的信号，同步插件在 `destroy()` 时发出。之后在途的拉取以 `RxDBError` 结束，B 的库与重开的 A 的库都没有那一行，A 的拉取游标没有推进。
- **AC#8**：变异：去掉 `RxDB.#recordIdentityBinding` 在唯一键冲突之后的重读重试（直接抛出），「两个身份同时第一次打开本功能之前建的库」下的两条竞争用例转红；恢复后转绿。
- **AC#10**：e2e 新增「两个浏览器上下文各自打开按会话身份算出的库」。测试进程按会话里的用户 id 与项目 URL 的 origin 独立算出期望的库名：两个上下文的名字不同，各自的 OPFS 与 IndexedDB 里出现自己的名字，不出现对方的。

## 运行结果

- 全量门禁 `pnpm test-all`（`nx affected`，基线 `main`）：98 个项目与其依赖的 35 个任务全过。第一次运行在 `rxdb-adapter-electron:test` 停下：PGlite 恢复的三个用例在 `--parallel=4` 下超过 60 s、一个 `beforeAll` 超过 10 s；单独 `pnpm nx run rxdb-adapter-electron:test` 全过（这几个用例各 25～27 s），按并发假失败处理后重跑门禁转绿。
- 门禁里与本故事相关的项目：`rxdb` 179 个文件、2904 个用例通过、1 个跳过；`rxdb-plugin-sync` 39 个文件、604 个用例；`rxdb-plugin-querycache` 15 个文件、226 个用例；`rxdb-adapter-supabase`（隔离栈）49 个文件、708 个用例；`dev-rxdb-supabase` 12 个文件、58 个用例；`dev-rxdb-supabase-e2e:e2e` 4 个用例。
- `pnpm nx test rxdb-adapter-supabase --skip-nx-cache -- src/__tests__/identity-guard.spec.ts`：9 个用例全过。
- `VITE_SUPABASE_URL=http://127.0.0.1:55001 VITE_SUPABASE_KEY=<anon key> pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`：`remote-sync.spec.ts` 5 个用例全过。
- `pnpm nx run rxdb-adapter-supabase:sql-security-regressions`：48 个用例、单事务汇总与升级原子性检查全过。

## 环境

- demo 单测曾报 `NG0203`：本检出位的 `node_modules` 是另一个分支的 lockfile 装出来的，带出 zone.js 的 peer 变体，`@angular/core` 有两份实例。按本分支 lockfile 离线重装（`pnpm install --frozen-lockfile --offline`）之后只剩一份 `@angular/core`，没有 zone.js；仓库不使用 zone.js，测试床默认 zoneless。
