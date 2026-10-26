---
package: rxdb-plugin-working-tree
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-plugin-working-tree 增量代码评审

## 结论

🟡 待处理：1 条 P2。本轮新增问题见 INC 编号条目。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 35 文件、测试/测试工具 48 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`c425f414 chore(deps): safely upgrade workspace dependencies`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：只读/可写检出位 add/open/attach/mount/release/remove/prune、Web Lock、快照与结构指纹、从提交建分支/分叉点、捕获与生命周期；重点核对失败清理。
- 实现锚点：`src/checkout/index.ts`、`src/checkout/read-only-capture-hook.ts`、`src/checkout/worktree-commands.ts`、`src/checkout/worktree-commit-view.ts`、`src/checkout/worktree-entities.ts`、`src/checkout/worktree-errors.ts`、`src/checkout/worktree-locks.ts` 等 35 个实现文件。

## 发现

### P2：`attach()` 的错误清理再次失败时跳过 Web Lock 释放，检出位持续被占用（INC-001）

- 引入：`b109ba33`（PR #122）。
- 证据：`src/checkout/worktree-manager.ts:276-279` 的 catch 先 `await snapshot?.disconnectAll()`，再 `await release()`；前一步 reject 就跳过还锁，且原始 attach 错误被清理错误覆盖。
- 触发：打开已释放的 persistent 只读检出位；连接/只读封印/更新登记行失败，随后断连也失败。失败的调用没有返回 view，调用方拿不到释放函数；后续 attach 持续报 `in_use`，直到所属浏览器上下文销毁。
- 验证：本轮 Chromium 临时回归对 `sealSnapshot` 与 `disconnectAll` 分别注入失败；attach reject 后，`navigator.locks.query()` 仍包含该检出位的锁，预期已释放的断言失败。现有全量 1,284 例通过，未覆盖此组合。
- 建议：用 `finally` 保证 `release()` 执行，并保留原始错误；补双重失败和失败后重新 attach 的回归。

## 验证与限制

本轮 Chromium 全量 **81 文件 / 1,284 例通过**；覆盖率 statements 96.39%、branches 90.27%、functions 97.50%、lines 97.55%，90% 门槛通过。另跑 checkout 102 例通过。INC-001 的临时回归按预期失败，证明现存缺陷；复现后已移除临时改动。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
