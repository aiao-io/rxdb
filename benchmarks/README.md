# RxDB Benchmarks (React)

RxDB + SQLite 适配器的性能基准测试工具 - React 版本

## 功能特性

- ✅ **吞吐量测试**：批量插入、查询、更新、删除操作的性能测试
- ✅ **延迟分布测试**：P50/P95/P99 延迟指标统计
- ✅ **扩展性测试**：不同数据规模下的性能表现
- ✅ **并发性能测试**：多并发操作场景下的性能评估
- ✅ **实时结果展示**：React 组件实时渲染测试进度和结果
- ✅ **数据导出**：支持 JSON 和 CSV 格式导出测试结果
- ✅ **主题切换**：亮色/暗色主题支持

## 技术栈

- **框架**: React 19 + TypeScript
- **构建**: Vite 8
- **UI**: Tailwind CSS 4 + DaisyUI
- **图标**: Lucide React
- **数据库**: RxDB + SQLite WASM (wa-sqlite)
- **Worker**: Web Worker + SharedWorker 支持

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 类型检查
pnpm typecheck

# 包内 spec（src/analysis、src/hooks、src/utils、src/config、scripts/*.spec.mjs 与根目录 *.spec.ts）
pnpm exec vitest run --project benchmarks
```

> benchmarks 没有 `test` 的 nx target，`package.json` 也没有 `test` script——包内
> spec 由 `vite.config.mts` 里的 vitest 配置收编，从仓库根用上面
> `--project benchmarks` 过滤跑（project 名来自该配置的 `name` 字段）。

### Node 端回归 benchmark

`*.bench.ts`（位于包根目录）是在 Node 下运行的回归基准，已接入 nx：

```bash
# 加密 vs 非加密性能基线（PGlite/memory）
pnpm nx bench-encryption benchmarks

# 非加密热路径回归（注册加密插件不应拖慢 Todo 路径）
pnpm nx bench-hot-path benchmarks

# 推送回执路径（US-218 阶段 B）：基线批（全 applied）vs 含被拒批（10/100 rejected，触发本地对齐）
pnpm nx bench-push-receipts benchmarks

# 手动排序的批内追加（US-031 阶段 A）：append vs explicit 写法中位数比值 + 单节点新建耗时
pnpm nx bench-sortable-batch benchmarks
```

> 类型检查（`pnpm nx typecheck benchmarks`）覆盖整个 `src/` 与根目录的 `*.bench.ts`。
>
> `bench-push-receipts` 没有自动门禁（新基准，无历史基线可比，见该文件头 TSDoc），
> 只打印 avg/p50/p95 与两场景差值，不接入下方「自动门禁」清单。

### 浏览器内搜索 benchmark（CI）

```bash
# Playwright 拉起 vite，跑 FTS 搜索基准并校验阈值，输出 reports/rxdb-plugin-search-latest.json
pnpm nx search-ci benchmarks
```

### 浏览器 Git 选型基准

```bash
NX_NO_CLOUD=true pnpm nx run benchmarks:test-git-benchmark
NX_NO_CLOUD=true pnpm nx run benchmarks:bench-git --output-style=static --skipRemoteCache
```

需要本机 Git 和 Playwright Chromium。运行器只监听 loopback，创建临时 Git HTTP 远端与独立浏览器上下文，
结束后清理临时目录。结果写入 `reports/browser-git-latest.json`，包含版本、源码摘要、机器信息和逐轮数据。

默认每种配置串行运行五次，轮换正反顺序；两个确定性仓库为 100 / 1000 个 4 KiB 普通文本文件。
MEMFS 对照统一使用 Emscripten FS 实现；OPFS 对照包含 isomorphic-git 的无整库缓存异步薄桥，
以及 wasm-git 的 pthreads / JSPI / Asyncify。后两者会预载整个仓库到 MEMFS，不应把热 status 的差异
全部归因于 Git 引擎。

操作覆盖 clone、干净 / 修改 status、十文件暂存与提交、checkout；OPFS 还包含 Worker 重建、
恢复和首次 status。先检查 tree OID 与文件字节，再解读耗时。快速等长改写、上游覆盖写入与重开脏状态
作为独立正确性结果保留；基准完成不等于候选可以直接用于产品。

可用环境变量调整实验，例如：

```bash
GIT_BENCH_PROFILES=large GIT_BENCH_ATTEMPTS=5 NX_NO_CLOUD=true pnpm nx run benchmarks:bench-git
GIT_BENCH_CONFIGS=isomorphic-memfs,wasm-memfs NX_NO_CLOUD=true pnpm nx run benchmarks:bench-git
```

`large` 为 3000 文件；`GIT_BENCH_REPORT` 可指定另一个 JSON 输出路径。报告提供中位数和范围；五个样本
的最近秩 p95 等于最大值，不作为稳定尾延迟或 CI 性能门禁。WASM linear memory 不包含完整 JS 堆或峰值 RSS。

### 可视化 Git + OPFS Demo

启动 benchmarks 开发服务器后打开 `http://localhost:3200/git-demo.html`：

```bash
pnpm nx serve benchmarks
```

页面固定使用 `wasm-git` JSPI，在 dedicated Worker 中把工作区和 `.git` 写入 OPFS，
可点击“运行 Git 闭环”执行初始化、修改、提交、分支切换和 Worker 重开；“重启 Worker”
单独验证恢复状态，“清空 OPFS 仓库”只删除这个 Demo 的仓库。页面是研究型验证入口，
不代表任意 Node / Nx 项目、依赖安装或隔离预览已经支持。

## 项目结构

```text
benchmarks/
├── src/
│   ├── app/
│   │   └── app.tsx              # 主应用组件
│   ├── components/
│   │   ├── BenchmarkResults.tsx # 结果表格组件
│   │   ├── ScoreCard.tsx        # 评分卡片组件
│   │   └── ThemeToggle.tsx      # 主题切换组件
│   ├── config/
│   │   └── vite-config.spec.ts  # vite 配置断言
│   ├── hooks/
│   │   ├── useBenchmark.ts      # 基准测试逻辑 Hook
│   │   └── useTheme.ts          # 主题管理 Hook
│   ├── scenarios/               # 测试场景
│   │   ├── throughput.ts
│   │   ├── latency.ts
│   │   ├── scalability.ts
│   │   └── concurrency.ts
│   ├── suites/                  # 浏览器内搜索基准套件
│   │   └── rxdb-plugin-search.bench.ts
│   ├── utils/                   # 工具函数
│   │   ├── rxdb-factory.ts
│   │   ├── export-results.ts
│   │   ├── performance.ts
│   │   ├── memory-tracker.ts
│   │   └── todo-factory.ts
│   ├── analysis/                # 数据分析工具
│   ├── constants.ts             # 常量定义
│   ├── clear-db.ts              # 数据库清理
│   ├── search-ci-runner.ts      # 浏览器内搜索 benchmark 运行器
│   ├── sqlite.worker.ts         # SQLite Worker
│   ├── sqlite-shared.worker.ts  # SQLite SharedWorker
│   ├── sqlite-wasm.worker.ts    # 官方 sqlite-wasm Worker
│   ├── sqlite-wasm-shared.worker.ts # 官方 sqlite-wasm SharedWorker
│   ├── sqliteai.worker.ts       # sqliteai Worker
│   ├── wa-sqlite.worker.ts      # wa-sqlite Worker
│   ├── main.tsx                 # 入口文件
│   └── styles.css               # 全局样式
├── index.html
├── vite.config.mts
└── package.json
```

## 浏览器要求

- Chrome/Edge 102+ (OPFS 支持)
- Safari 15.2+ (SharedWorker + IndexedDB)
- Firefox 111+ (OPFS 支持)

## 参考目标（非自动校验）

下列为设计参考目标，仅作对照，**不会**在本应用中自动断言（实际数值取决于浏览器/适配器/硬件）：

- **查询延迟**: < 16ms (60fps)
- **数据库初始化**: < 100ms

仅有以下指标被**自动门禁**：

- `search-ci`：独立运行 3 次并按中位数判定，INSERT→查询 P90 ≤ 100ms、批量 100 写入→查询 P95 ≤ 5000ms
- `bench-hot-path`：非加密热路径相对基线回归 ≤ 2%
- `bench-working-tree`：工作树 `status` / `diff` / `restore` / `commit` 的 p95 ÷ 同次 control p95，≤ 冻结 reference median × 该项容差（读项 130%，写项 110%；PR CI 唯一硬门禁，口径与冻结规则见 [epic-006](../requirements/epics/epic-006-working-tree-commits.md)「性能预算的口径」「reference 的冻结与复冻」）
  - reference 按**比值画像**（系统/架构 + CPU 型号 + Node 主版本）分份放在 `reports/working-tree-reference/`，只和同画像的比；本机画像没有 reference 时以 `benchmark_environment_mismatch` 失败，不降级为通过
  - 为新画像冻结：所在提交先在已冻结画像上过门禁，再推注解 tag `git tag -a bench-freeze/<日期> -m "理由"`（或手动触发 `bench-freeze` workflow），下载 artifact 检查后签入；本机则是 `node --experimental-strip-types benchmarks/freeze-working-tree-reference.ts --new-profile "理由"`
