# dev-rxdb-supabase E2E Tests

`apps/dev-rxdb-supabase` 的浏览器级门禁。

## 这套件同时覆盖本地与远端模式

`src/home.spec.ts` 是 local-only 套件：里有一条 `auto` fixture
（`localOnly`）会收集所有指向 `baseURL` 之外的 http(s) / WebSocket 请求，并在每个用例结束时
断言其为空。任何一次远端连接都会让用例失败。

原因是这些用例断的是**绝对数量**（`data-loaded-count` 等于页大小、删除后计数归零）。
只要应用真的连上了远端，远端一有数据这些断言就不成立 —— 该项目历史上被 Nx 标记 flaky
正源于此（当时跑的是 Angular dev server，工作区 `.env` 的 `VITE_SUPABASE_*` 泄进了 `import.meta.env`）。

远端同步由独立的 `e2e-remote` target 覆盖：`remote-sync.spec.ts` 使用 `serve-remote`，创建 Todo
后点击 Push，断言真实 `POST /rest/v1/rpc/rxdb_mutations`，并检查远端安全告警。CI 仅在
`e2e-remote` 受影响时启动 Supabase 栈；本地-only 用例仍不连远端。

## 跑

```bash
pnpm nx run dev-rxdb-supabase-e2e:e2e          # 会先 build 应用
pnpm nx run dev-rxdb-supabase-e2e:e2e-remote   # 需要本地 Supabase（54331）
pnpm exec playwright test src/home.spec.ts     # 已 build 过时直接跑
```

`webServer` 用 `nx run dev-rxdb-supabase:serve-e2e` 服务**构建产物**而不是 dev server：
构建期的 `define` 会把 `import.meta.env` 定死，环境变量再也泄不进来；顺带这份产物才是 CI 真正构建的那份。
`serve-e2e` 与 `serve-static` 的唯一区别是**不带 `buildTarget`**：产物由 `e2e` target 的
`dependsOn: ["dev-rxdb-supabase:build"]` 保证，webServer 里再建一次只会多起一个
`NX_DAEMON=false`、与外层 nx 互不协调的 nx 进程，和并行跑的其它 e2e 抢同一份 `packages/*/dist`
（vite `emptyOutDir` 撞上另一进程的写入 → `ENOTEMPTY`，即 `rxdb-test:build` 被标记 flaky 的根因）。
`reuseExistingServer: false` —— @nx/web 的 file-server 在端口被占时会静默换端口，
复用又会让残留进程（serve 的是旧产物）被当成本次的服务器，两者叠加就是「测试跑在说不清是哪份产物的服务上」。

`e2e-remote` 改用 `serve-remote` 和 8314 端口，远端变量由 CI 或本地 `.env` 提供。

## 产物落点

报告与 trace 由 `nxE2EPreset` 统一安排在 `test-output/playwright/` 下
（CI 上额外生成 blob 报告供分片合并）。**不要在 `playwright.config.ts` 里覆盖 `reporter`** ——
整体覆盖会同时丢掉 blob 报告并把 html 报告写到 `test-output/` 之外。

## 相关文档

- Supabase 栈与端口：`docker/docker-compose.ci.yml`（kong 容器内 8000 → 宿主 **54331**）
- 环境变量样例：仓库根 `.env.example`
