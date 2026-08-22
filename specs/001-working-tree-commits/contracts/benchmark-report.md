# Contract: 性能基准与门禁

> [!WARNING]
> **本文件已过期（2026-08-22）。** 上游 [epic-006](../../../requirements/epics/epic-006-working-tree-commits.md) 已裁决
> **不做暂存区（index / staging area）与任何形式的选择性提交**：没有 `stage` / `unstage` / `clearIndex`，
> `commit(message)` 只提交当前分支工作树的全部未提交变更，隔离工作线用分支。
> 本文件仍按「工作树 → 缓存区 → 提交」三层写成，其中所有 `Index*` / `RxDBIndexEntry` / `indexRevision` /
> `staged` 相关的表、契约、状态迁移、验收项与基准 fixture **均已作废，不得据此实现**。
> 真相源以 `requirements/` 为准；本目录需要用 `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` 重新生成。

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) | **Date**: 2026-08-15

US4（US-306 阶段 C）**拥有** `benchmarks:bench-working-tree` 这个 target 本身：fixture 构造、warmup/采样参数、`runnerProfileHash`、报告 JSON 结构与 reference 签入流程。US5 只向其中**追加 restore 采样场景**，不新建 target、不改报告结构、不重算已冻结的 reference。

---

## 1. Target

```bash
pnpm nx run benchmarks:bench-working-tree
```

新增于 [`benchmarks/project.json`](../../../benchmarks/project.json)，沿用既有 `bench-encryption` / `bench-hot-path` 的形态：`node --experimental-strip-types working-tree.bench.ts`，`dependsOn: ["typecheck", "^build"]`，`cwd: "benchmarks"`。

---

## 2. 固定 fixture

| 参数             | 值                                               |
| ---------------- | ------------------------------------------------ |
| 运行环境         | Node + PGlite **memory**（不是浏览器、不是磁盘） |
| 实体总数         | 10,000                                           |
| 提交数           | 100                                              |
| 每提交变更单元数 | 100                                              |
| 未暂存条目数     | 100                                              |
| 已暂存条目数     | 50                                               |
| WARMUP           | 5                                                |
| SAMPLES          | 50                                               |

fixture 由确定性种子构造（无随机、无时钟依赖），其内容摘要写入报告的 `fixtureHash`。

---

## 3. 采样场景

| 场景                                                         | 归属     |
| ------------------------------------------------------------ | -------- |
| `status`                                                     | US4      |
| 完整 `diff`                                                  | US4      |
| 批量 `stage` 50 单元                                         | US4      |
| `restore`（clean HEAD 恢复含 **100 个变更单元**的 `HEAD~1`） | US5 追加 |

每个场景独立 warmup 5 次、采样 50 次。

---

## 4. 报告 JSON 结构

```json
{
  "target": "bench-working-tree",
  "fixture": { "entities": 10000, "commits": 100, ..., "fixtureHash": "<hash>" },
  "runnerProfile": {
    "nodeVersion": "...", "pgliteVersion": "...",
    "os": "...", "arch": "...", "cpuModel": "...", "cpuCores": 0,
    "totalMemoryBytes": 0, "runnerId": "...", "concurrency": 0
  },
  "runnerProfileHash": "<stable digest of runnerProfile>",
  "scenarios": [
    { "name": "status", "p50": 0, "p95": 0, "controlRatio": 0, "normalizedRatio": 0 }
  ]
}
```

`runnerProfileHash` 是对上述 `runnerProfile` 全部字段归一化后的稳定摘要（[R-013](../research.md#r-013-benchmark-报告结构与-runnerprofilehash)）。

---

## 5. 三态门禁

参考报告：`benchmarks/reports/working-tree-reference.json`，MUST **先于**候选发布签入。

| 条件                                                    | 结论                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 归一化 ratio > reference median 的 **110%**             | **失败**                                                                      |
| ratio 达标 **且** `runnerProfileHash` 与 reference 匹配 | 追加绝对判据：p95 ≤ **100 ms**（发布门禁）                                    |
| ratio 达标 **但** `runnerProfileHash` 不匹配            | 产出 `benchmark_environment_mismatch`，**跳过**绝对判据 —— **不得放宽为通过** |

**失败后禁止以重算基线的方式转绿**（FR-041）。判据 SC-012：环境不匹配时产出环境不匹配结论的比例为 **100%**，产出绿色发布结论的比例为 **0%**。

---

## 6. 与宪法 IV 的关系

| 宪法预算            | 本特性对应                                    | 状态                                                                                                                                                                       |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 查询 < 16 ms        | `status` / `diff` 的响应式读取                | 达标                                                                                                                                                                       |
| 数据库操作 < 100 ms | `status` / `diff` / 批量 `stage` p95 ≤ 100 ms | 达标                                                                                                                                                                       |
| 数据库操作 < 100 ms | **`restore` p95 ≤ 1 s**                       | **例外**（已在 [plan.md Complexity Tracking](../plan.md) 登记：批量操作，按 10,000 实体规模不可能落进 100 ms；备选「拆成可见中间态的多次提交」与「限制 10 单元」均已否决） |
| 包体积 < 50 KB gz   | 新增核心子模块 + 三端 hook                    | 需在 US4 收尾时实测                                                                                                                                                        |

---

## 7. 浏览器侧

三端 E2E 记录首次可见状态耗时，**仅作观测，不作门禁** —— 浏览器 OPFS/IDB 的绝对数字不跨环境承诺。
