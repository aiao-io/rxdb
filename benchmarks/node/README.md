# Node.js Benchmarks

这里放运行在 Node.js 中的性能基准入口。它们和 `src/` 下的浏览器交互式基准分开，适合做稳定的回归比较或 CI 门禁。

## 文件作用

| 文件                              | 作用                                                              | Nx target              |
| --------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| `bench-stats.ts`                  | 共用 `median`、`percentile` 和 `summarise`，只包含纯统计函数      | 被其他基准直接导入     |
| `encryption.bench.ts`             | PGlite memory 下比较加密实体和普通实体的 create、find、batch-save | `bench-encryption`     |
| `non-encrypted-hot-path.bench.ts` | 验证注册加密插件后，普通 Todo 热路径没有超过 2% 回归              | `bench-hot-path`       |
| `push-receipts.bench.ts`          | 比较全 applied 批次和包含 rejected 项目的推送回执路径             | `bench-push-receipts`  |
| `sortable-batch-append.bench.ts`  | 比较排序树批内显式键和缺键追加的耗时比值                          | `bench-sortable-batch` |
| `working-tree/`                   | 工作树插件的门禁、fixture、报告和冻结脚本                         | `bench-working-tree`   |

工作树相关文件不要在这里重复维护，直接看 [`working-tree/README.md`](working-tree/README.md)。

## 运行

从仓库根目录运行 Nx target：

```bash
pnpm nx run benchmarks:bench-encryption
pnpm nx run benchmarks:bench-hot-path
pnpm nx run benchmarks:bench-push-receipts
pnpm nx run benchmarks:bench-sortable-batch
pnpm nx run benchmarks:bench-working-tree
```

也可以直接运行单个入口，适合本地调试：

```bash
node --experimental-strip-types benchmarks/node/encryption.bench.ts
node --experimental-strip-types benchmarks/node/non-encrypted-hot-path.bench.ts
node --experimental-strip-types benchmarks/node/push-receipts.bench.ts
node --experimental-strip-types benchmarks/node/sortable-batch-append.bench.ts
```

所有 Node 文件都被 `pnpm nx run benchmarks:typecheck` 覆盖。公共统计函数保持纯模块，避免导入 `*.bench.ts` 时自动启动一次完整 benchmark。

## 输出和门禁

大多数基准把带机器信息的 JSON 写入 `benchmarks/reports/`。`bench-hot-path` 和 `bench-working-tree` 会根据门禁规则设置非零退出码；`bench-push-receipts` 主要用于记录对比数据，目前没有历史回归阈值。

工作树的报告路径、冻结 reference 和 CI 用法见 [`working-tree/README.md`](working-tree/README.md)。
