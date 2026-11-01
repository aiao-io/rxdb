# Working-tree Benchmark

这组脚本验证 `@aiao/rxdb-plugin-working-tree` 的四个操作：`status`、`diff`、`restore` 和 `commit`。每个操作同时跑带插件的 treatment 和同规模的 control，使用同一次运行的 P95 比值做测量，再和同一运行环境画像的冻结 reference 比较。

## 文件作用

| 文件                               | 作用                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `working-tree.bench.ts`            | benchmark 入口；创建 control / treatment 数据库、灌入 fixture、采样四类操作并执行门禁 |
| `working-tree-fixture.ts`          | 生成固定形状和固定内容 hash 的 10,000 实体 fixture，提供提交、恢复和完整性校验操作    |
| `working-tree-report.ts`           | 报告类型、采样常量、绝对预算、reference 目录和最新报告路径                            |
| `working-tree-gate.ts`             | 收集运行环境、计算画像、读取 reference、选择 reference、执行相对门禁和冻结准入判定    |
| `working-tree-gate.spec.ts`        | 测试画像计算、reference 选择、门禁和冻结准入规则                                      |
| `freeze-working-tree-reference.ts` | 在同一机器上独立运行多次，汇总结果并冻结新画像 reference                              |

这些文件放在同一目录，是因为它们共享同一份报告契约和 fixture 形状；只有 `working-tree.bench.ts` 与冻结脚本是可执行入口，其余文件都是可测试的纯模块或共享模块。

## 运行 benchmark

```bash
pnpm nx run benchmarks:bench-working-tree
```

这会运行一次完整 fixture 和四类操作。最新结果写入：

```text
benchmarks/reports/working-tree-latest.json
```

该文件每次运行都会覆盖，属于本地运行产物。没有匹配的 reference 时，任务会以 `benchmark_environment_mismatch` 失败，不会降级为通过。

## 冻结新画像

只有以下情况可以冻结 reference：首次覆盖一个新画像，或者已经在旧 reference 上通过门禁并有明确理由重新生成。先运行：

```bash
node --experimental-strip-types \
  benchmarks/node/working-tree/freeze-working-tree-reference.ts \
  --new-profile "说明 CPU / Node 画像和冻结原因"
```

已存在的画像会直接跳过。需要重新生成当前画像时使用：

```bash
node --experimental-strip-types \
  benchmarks/node/working-tree/freeze-working-tree-reference.ts \
  --regenerate "说明重新冻结原因"
```

冻结脚本默认进行 10 次独立进程运行，每次都会重新创建数据库、灌入 fixture 和预热。成功后按画像写入：

```text
benchmarks/reports/working-tree-reference/<ratio-profile>.json
```

`.github/workflows/bench-freeze.yml` 使用同一个入口为 CI runner 画像冻结 reference。不要用失败的候选版本重新生成基线，也不要把不同 CPU 或不同 Node 主版本的结果混在一起。

## 规则和阈值

- `status`、`diff`：相对 reference median 的容差为 130%。
- `restore`、`commit`：相对 reference median 的容差为 110%。
- `status`、`diff`：绝对 P95 上限为 100ms。
- `restore`：绝对 P95 上限为 1,000ms。
- `commit`：使用冻结 reference 中的绝对预算。

详细契约见 [`requirements/epics/epic-006-working-tree-commits.md`](../../../requirements/epics/epic-006-working-tree-commits.md)。

## 测试

```bash
pnpm nx run benchmarks:test
```

`working-tree-gate.spec.ts` 会由 benchmarks 的 Vitest 配置自动发现，不需要单独复制测试入口。
