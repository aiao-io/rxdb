# dev-rxdb-angular E2E Tests

`apps/dev-rxdb-angular` 的浏览器级门禁（Playwright + Chromium）。

> **写在前面**：这份 README 上一版有 6 处与实现对不上的陈述（用例数、已删除的 spec、
> 超时值、视频录制、artifacts 上传、启动命令）。**过期的文档比没有文档更贵** ——
> 它会让人按照不存在的行为做决定。所以这一版只写**可以被 grep 或 config 验证的事**，
> 具体数字尽量不写死。

## 覆盖范围

`src/` 下每个 `*.spec.ts` 对应一个页面或一条功能路径。用例总数请直接跑：

```bash
pnpm exec playwright test --list | tail -1
```

覆盖的路由可以从 spec 里直接读出来：

```bash
grep -rho "goto('[^']*'" src/*.spec.ts | sort -u
```

可写数据的 spec 在首次导航前调用 `resetE2eState(page)`：它为当前 context
轮换数据库隔离名，但在同一测试的 reload 中保留该名字。由
`state-isolation.spec.ts` 直接验证「跨 context 看不到数据、reload 仍能看到数据」。
会写数据或依赖固定语料的 Search 用例另用 `callSearchApi(page, 'reset')` 重置种子。

刷新持久化门禁覆盖 todo 新增/编辑、tree-menu 父子关系、file-manager 批量插入
和 encrypted 用户；新增可写页面时，必须同时选择其中一种隔离方式并补 reload 断言。

## 运行

```bash
pnpm nx run dev-rxdb-angular-e2e:e2e      # 会先 build 应用
pnpm exec playwright test                  # 已 build 过时直接跑
pnpm exec playwright test --grep "Todo"    # 按用例名过滤
pnpm exec playwright test --ui             # 调试
```

`webServer` 用 `nx run dev-rxdb-angular:serve-e2e` 服务**构建产物**而不是 dev server ——
这样本地与 CI 跑的是同一份东西。`serve-e2e` 与 `serve-static` 的唯一区别是**不带 `buildTarget`**：
产物由 `e2e` target 的 `dependsOn: ["dev-rxdb-angular:build"]` 保证，webServer 里再建一次只会多起
一个 `NX_DAEMON=false`、与外层 nx 互不协调的 nx 进程，和并行跑的其它 e2e 抢同一份
`packages/*/dist`（vite `emptyOutDir` 撞上另一进程的写入 → `ENOTEMPTY`，即 `rxdb-test:build`
被标记 flaky 的根因）。

## 配置要点（以 `playwright.config.ts` 为准，不在这里复述数值）

- **并行度**：`fullyParallel: false` + `workers: 2`。本套件的用例较重
  （批量插入数千条 → wa-sqlite/OPFS worker），激进并行是本项目 flaky 史的成因。
- **重试**：本地为 0，CI 为 2。不要用本地重试掩盖失败；需要定位 flaky 时，使用
  `--retries=0 --repeat-each=N` 建立确定性复现。
- **报告**：由 `nxE2EPreset` 统一安排在 `test-output/playwright/` 下，CI 额外产出 blob 报告
  供分片合并。**不要在 config 里覆盖 `reporter`** —— 整体覆盖会同时丢掉 blob，
  并把 html 写到 `test-output/` 之外（磁盘上会出现两份报告）。
- **浏览器**：只有 chromium。firefox / webkit 的 project 定义留在文件里但被注释掉了 ——
  要开需要先评估 CI 时长与 wa-sqlite 在这两个引擎上的可用性。

## 定位约定

优先级从高到低：

1. `getByRole` + 可访问名 —— 它同时是一条 a11y 断言；
2. 应用显式提供的 `data-testid` / `id`（如 `input#menu-title-input`）；
3. 语义类（如 tree-menu-lazy 的 `drop-into` / `drop-invalid`）。

**不要用**：DaisyUI / Tailwind 工具类（`.badge-primary`、`.loading-spinner`、`invisible`）、
DOM 父层级（`locator('..')`）、`.or()` 兜底选择器、全页 `text="..."`。
前者会在换皮肤时集体失效，后几种会在结构微调时**静默指向错误的元素而不报错**。
`src/` 里仍有存量违反，见 P1-3 / P1-4 / P1-9 的判定。
