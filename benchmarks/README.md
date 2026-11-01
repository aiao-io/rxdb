# RxDB Benchmarks

RxDB 的浏览器和 Node.js 性能验证工作区。这里同时维护交互式浏览器基准、CI 性能门禁、Node 回归基准，以及浏览器 Git + OPFS 研究 Demo。

## 功能地图

| 入口                          | 用途                                                                                    | 运行方式                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/`                           | 浏览器内测量本地数据库的吞吐量、延迟、扩展性和并发                                      | `pnpm nx serve benchmarks`                                      |
| `/browser-git-opfs-demo.html` | 在 dedicated Worker 中验证 wasm-git + OPFS 的初始化、修改、提交、分支切换和 Worker 重开 | 启动开发服务器后打开该地址                                      |
| `search-ci`                   | 用 Playwright 运行浏览器内全文搜索基准并检查阈值                                        | `pnpm nx run benchmarks:search-ci`                              |
| `bench-git`                   | 比较 isomorphic-git、wasm-git、MEMFS 和 OPFS 的 Git 工作流                              | `pnpm nx run benchmarks:bench-git`                              |
| `node/`                       | Node.js 回归基准和工作树门禁                                                            | 见 [`node/README.md`](node/README.md)                           |
| `node/working-tree/`          | 工作树插件的 fixture、报告、门禁和 reference 冻结                                       | 见 [`node/working-tree/README.md`](node/working-tree/README.md) |

浏览器首页支持以下本地数据库实现：PGlite、wa-sqlite、sqlite-wasm、sqliteai 和官方 SQLite WASM。测试结果可以导出为 JSON 或 CSV。

## 快速开始

```bash
# 在仓库根目录安装依赖
pnpm install

# 启动浏览器基准首页
pnpm nx serve benchmarks
```

启动后访问：

- 首页：`http://localhost:3200/`
- Git + OPFS Demo：`http://localhost:3200/browser-git-opfs-demo.html`

首页上的 Git + OPFS 卡片是研究 Demo 的正式入口。这个 Demo 使用独立 Worker 和 OPFS 保存实验仓库，开发态会显示 `@aiao/rxdb-devtools` 连接器状态；它不创建 RxDB 实例，也不代表任意 Node / Nx 项目已经支持浏览器 Git。

## 常用校验

```bash
pnpm nx run benchmarks:typecheck
pnpm nx run benchmarks:test
pnpm nx run benchmarks:lint
pnpm nx run benchmarks:build
```

`typecheck` 覆盖 `src/` 和 `node/`；`test` 通过 `vite.config.mts` 收编 `src/**/*.spec.ts(x)`、`scripts/**/*.spec.mjs` 和 `node/**/*.spec.ts`。

## 目录边界

```text
benchmarks/
├── node/                 # Node.js 基准入口和工作树门禁模块
│   ├── *.bench.ts        # 可直接运行或由 Nx 调用的 Node 基准
│   └── working-tree/     # 工作树 benchmark 的共享模块、测试和冻结脚本
├── scripts/              # 浏览器 Git、搜索 CI 等 Node 编排脚本
├── src/                  # React 浏览器首页、场景、Worker 和搜索套件
├── browser-git-opfs-demo.html
├── index.html
├── project.json          # Nx targets
├── vite.config.mts       # Vite 多页面、Worker 和测试配置
└── reports/              # Git 基准结果和工作树冻结 reference
```

Node 基准的文件作用、运行命令和输出位置见 [`node/README.md`](node/README.md)。工作树门禁涉及 reference 画像、报告格式和冻结规则，见 [`node/working-tree/README.md`](node/working-tree/README.md)。

## 浏览器搜索 CI

```bash
pnpm nx run benchmarks:search-ci
```

该任务会启动 Vite 和 Playwright，运行全文搜索场景，独立采样后按中位数检查：

- INSERT 后重新查询 P90 ≤ 100ms
- 批量写入 100 条后重新查询 P95 ≤ 5000ms

报告写入 `reports/rxdb-plugin-search-latest.json`，该文件是运行产物，不入库。

## 浏览器 Git 基准

```bash
pnpm nx run benchmarks:test-git-benchmark
pnpm nx run benchmarks:bench-git --outputStyle=static --skipNxCache
```

需要本机 Git 和 Playwright Chromium。运行器创建临时 Git HTTP 远端和独立浏览器上下文，覆盖 clone、干净 / 修改 status、暂存、提交、checkout，以及 OPFS Worker 重建和恢复。结果默认写入 `reports/browser-git-latest.json`。

可以用环境变量缩小或扩大实验：

```bash
GIT_BENCH_PROFILES=large GIT_BENCH_ATTEMPTS=5 pnpm nx run benchmarks:bench-git
GIT_BENCH_CONFIGS=isomorphic-memfs,wasm-memfs pnpm nx run benchmarks:bench-git
```

## 浏览器要求

- Chrome / Edge 102+：OPFS
- Safari 15.2+：SharedWorker 和 IndexedDB
- Firefox 111+：OPFS

首页的参考目标是设计目标，不自动判定；当前自动门禁包括 `search-ci`、`bench-hot-path` 和 `bench-working-tree`。具体阈值和工作树 reference 规则见 [`node/working-tree/README.md`](node/working-tree/README.md)。
