# Contract: Benchmark 报告与性能门禁

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

本文件冻结 benchmark 产出的 **JSON 契约**与**两道门禁的判定规则**。数字本身不在这里——它们由首个绿色实现归档并冻结。

> 旧 benchmark-report.md 中针对缓存区操作（stage / unstage / `HEAD ↔ index` diff）的项目**全部作废**。

## 0. 为什么不写裸墙钟数字

不指定设备与存储后端（OPFS / IDB / wa-sqlite / PGlite 的差距是数量级）、不定义「响应」是 promise resolve 还是首次绘制、不给统计口径（p50 / p95 / max），在 CI 机器上做绝对墙钟断言**必然抖动**，而抖动的门禁最终会被关掉。因此采用**双门禁**。

## 1. 基准环境与 fixture（固定，不可按需调整）

| 项           | 值                                                                   |
| ------------ | -------------------------------------------------------------------- |
| 运行环境     | Node + PGlite **memory**                                             |
| 「响应」定义 | **API promise resolve**（操作完成），不混入三框架首次绘制            |
| 预热         | `WARMUP = 5`                                                         |
| 采样         | `SAMPLES = 50`                                                       |
| fixture      | **10,000 实体 / 100 commit（每 commit 100 单元）/ 100 个未提交单元** |
| 恢复时机     | 每个 sample 前在**计时外**恢复同一 fixture                           |

**fixture 内容与其 hash 必须写进 JSON**；只固定总行数不算固定 fixture——行数相同而内容分布不同会让 ratio 漂移几十个百分点，且看不出来。

Nx target：`benchmarks` 项目（`benchmarks/project.json`，sourceRoot `benchmarks/src`）下新增 `bench-working-tree`。

## 2. 报告 JSON 契约

```jsonc
{
  "schemaVersion": 1,
  "fixture": {
    "entities": 10000,
    "commits": 100,
    "unitsPerCommit": 100,
    "uncommittedUnits": 100,
    "contentHash": "<fixture 内容 hash，非仅行数>"
  },
  "environment": {
    "runtime": "node vX.Y.Z",
    "os": "...",
    "cpuModel": "...",
    "logicalCores": 0,
    "memoryBytes": 0,
    "runnerId": "...",
    "concurrency": 0,
    "runnerProfileHash": "<由以上字段计算>"
  },
  "sampling": { "warmup": 5, "samples": 50 },
  "measurements": [
    {
      "id": "status",
      "p50": 0,
      "p95": 0,
      "max": 0,
      "controlId": "control_crud",
      "controlP95": 0,
      "ratio": 0 // p95 / controlP95
    }
  ],
  "reference": {
    "commit": "<reference commit sha>",
    "runs": 10,
    "medianRatios": { "status": 0, "diff": 0, "commit": 0, "restore": 0 },
    "frozenAbsolute": { "commit": 0 } // 见 §4
  }
}
```

**control 的定义**：每项被测操作对应一次 control CRUD，使用**相同实体数量与相同事务边界**。ratio = 被测 p95 ÷ 同次 control p95。control 与被测在**同一次运行内**采样，否则机器状态漂移会混进 ratio。

## 3. 两道门禁

### 3.1 相对门禁 —— 普通 PR CI 的**唯一**硬门禁

- 候选版本各项 `ratio` **不得超过冻结 reference median 的 110%**。
- reference：首个绿色实现归档 reference commit 的 **10 次独立运行**，取各项 median ratio。
- **reference JSON 与阈值必须先于发布候选签入**。失败后重算基线 = 门禁自证其绿，禁止。

### 3.2 绝对门禁 —— 仅发布，且仅在 profile 匹配的 runner 上

| 测点      | 绝对 p95                                           | 依据   |
| --------- | -------------------------------------------------- | ------ |
| `status`  | ≤ **100 ms**                                       | SC-001 |
| `diff`    | ≤ **100 ms**（无 scope 的完整 diff）               | SC-002 |
| `restore` | ≤ **1 s**（从 clean HEAD 恢复 `HEAD~1`，100 单元） | SC-004 |
| `commit`  | **不套用 100 ms** —— 见 §4                         | SC-003 |

`runnerProfileHash` 与 reference 不一致时返回 **`benchmark_environment_mismatch`**，**不得伪装成性能回归**，也不得因此降级为通过。

## 4. `commit` 的绝对预算（已批准的宪法例外）

`commit` **免除** constitution IV 的「DB op < 100 ms」。

- **理由**：它要在单个事务内落盘 100 个单元、CAS 推进 branch ref、并清空 100 个工作树条目；100 ms 是为单次实体读写设定的预算，量级不同。
- **替代预算**：由**首个绿色实现的 reference 中位数冻结**，与相对门禁**同批签入**，因此仍是硬数字，不是「不设限」。
- **不适用范围**：`status` / `diff` / `restore` 照常受 §3.2 约束。
- 完整论证与被拒绝的更简单方案见 [../plan.md](../plan.md) 的 Complexity Tracking。

## 5. 浏览器端（SC-005）

浏览器 OPFS / IDB **不承诺**相同绝对数字。但三端 E2E **必须记录首次可见状态耗时**——防止核心 promise 很快返回而 UI 长时间无反馈。该指标**不进**本 JSON 的 `measurements`，单独归档。
