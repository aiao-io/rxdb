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
- **构建**: Vite 7 + SWC
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

# 单元测试（分析/工具纯函数）
pnpm nx test benchmarks
```

### Node 端回归 benchmark

`*.bench.ts`（位于包根目录）是在 Node 下运行的回归基准，已接入 nx：

```bash
# 加密 vs 非加密性能基线（PGlite/memory）
pnpm nx bench-encryption benchmarks

# 非加密热路径回归（注册加密插件不应拖慢 Todo 路径）
pnpm nx bench-hot-path benchmarks
```

> 类型检查（`pnpm nx typecheck benchmarks`）覆盖整个 `src/` 与根目录的 `*.bench.ts`。

### 浏览器内搜索 benchmark（CI）

```bash
# Playwright 拉起 vite，跑 FTS 搜索基准并校验阈值，输出 reports/rxdb-plugin-search-latest.json
pnpm nx search-ci benchmarks
```

## 项目结构

```text
benchmarks/
├── src/
│   ├── app/
│   │   └── app.tsx              # 主应用组件
│   ├── components/
│   │   ├── BenchmarkResults.tsx # 结果表格组件
│   │   └── ThemeToggle.tsx      # 主题切换组件
│   ├── hooks/
│   │   ├── useBenchmark.ts      # 基准测试逻辑 Hook
│   │   └── useTheme.ts          # 主题管理 Hook
│   ├── scenarios/               # 测试场景 (与 vanilla 版本共享)
│   │   ├── throughput.ts
│   │   ├── latency.ts
│   │   ├── scalability.ts
│   │   └── concurrency.ts
│   ├── utils/                   # 工具函数 (与 vanilla 版本共享)
│   │   ├── rxdb-factory.ts
│   │   ├── export-results.ts
│   │   ├── performance.ts
│   │   ├── memory-tracker.ts
│   │   └── todo-factory.ts
│   ├── analysis/                # 数据分析工具 (与 vanilla 版本共享)
│   ├── constants.ts             # 常量定义
│   ├── clear-db.ts              # 数据库清理
│   ├── sqlite.worker.ts         # SQLite Worker
│   ├── sqlite-shared.worker.ts  # SQLite SharedWorker
│   ├── main.tsx                 # 入口文件
│   └── styles.css               # 全局样式
├── index.html
├── vite.config.mts
└── package.json
```

## 与 Vanilla 版本的差异

本项目是从 `benchmarks` (vanilla TypeScript) 移植而来，主要差异：

| 方面     | Vanilla 版本        | React 版本                       |
| -------- | ------------------- | -------------------------------- |
| UI 渲染  | 直接 DOM 操作       | React 组件                       |
| 状态管理 | 全局变量 + 事件监听 | React Hooks (useState/useEffect) |
| 主题切换 | DOM 属性操作        | useTheme Hook                    |
| 结果展示 | innerHTML 动态生成  | BenchmarkResults 组件            |
| 业务逻辑 | ✅ 完全复用         | ✅ 完全复用                      |
| Worker   | ✅ 完全复用         | ✅ 完全复用                      |
| 测试场景 | ✅ 完全复用         | ✅ 完全复用                      |

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
