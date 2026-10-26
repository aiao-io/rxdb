---
package: rxdb
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb 增量代码评审

## 结论

🟡 待处理：2 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 37 文件、测试/测试工具 21 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`e644e68a chore(aiao): refresh package knowledge artifacts`；`a55af975 chore(aiao): refresh package knowledge artifacts`；`8b1f50e5 chore(aiao): refresh package knowledge artifacts`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：WorktreeTableSet、换挂与实体身份缓存、只读写入口、仓库事务包装与回滚 checkpoint、分支持有键、schema 指纹和插件销毁；游标与网络旧发现按当前实现复核。
- 实现锚点：`src/RxDB.ts`、`src/RxDBError.ts`、`src/backup/schema-fingerprint-encoding.ts`、`src/backup/schema-fingerprint.ts`、`src/entity/clone-entity-classes.ts`、`src/entity/entity-bookkeeping.ts`、`src/entity/entity-manager.ts` 等 37 个实现文件。

## 发现

### P2：`findByCursor` 的游标规则在订阅期只生成一次，排序键被编辑后重锚判据失效——边界行跨页重复、后续行丢失

- 证据：`src/repository/Repository.ts:401-411` 中 `_generate_cursor_rule_group(normalized)` 在 `findByCursor` 调用期执行一次，把游标的**排序键取值**烘焙进 `new_where`，runner 闭包每次 refresh 复用同一份谓词；三端无限滚动的重锚守卫只比较游标 id：React `packages/rxdb-react/src/useInfiniteScroll.ts:205`、Vue `packages/rxdb-vue/src/useInfiniteScroll.ts:238`、Angular `packages/rxdb-angular/src/InfiniteScrollingList.ts:304`（`cursorId(...) !== cursorId(tail)` 即不重锚）。
- 触发：`orderBy [name asc, id asc]`、limit 10、已加载两页；把第 1 页尾行（第 10 行的锚点）`name` 从 `Jade` 改成 `Jasmine`（仍在第 9 与第 11 行之间）。第 1 页重发后尾行 id 不变 → 不重锚；第 2 页沿用旧谓词 `name > 'Jade'`，改名后的锚点行自身落入第 2 页 → 第 10 行跨页重复、第 20 行从并集消失；此后第 2 页每次刷新持续用旧锚点，直到锚点行离开该页或用户手动 refresh。
- 建议：重锚判据比较游标实体的 orderBy 投影值（不止 id），或把 `_generate_cursor_rule_group` 移进 runner 让每次重跑从活锚点实体重读当前排序键值。

### P2：`ReachabilityMonitor` 构造期即离线时，以零订阅方启动退避节拍并空转整个页面生命周期

- 证据：`src/network/reachability.ts:151-160` 构造函数无条件 `#read_navigator()`；`246-249` 在 `navigator.onLine === false` 时 `#setOnline(false)` → 排节拍；`#scheduleWakeup()` 回调每轮自续（1s→30s 上限），且没有订阅方守卫。`watch()` 的 teardown（`197-201`）会 `#clearTimer()` 防的正是这种状态——注释自己写明「撤空之后没人停它——一台离线的监视器会按 maxDelayMs 永远空转」。构造路径却没有同款防护，`report(networkError)`（`213-222`）在零订阅方时同样触发。
- 触发：页面离线加载（飞行模式）；`RxDB.ts:425` 对每个实例急切构造 `ReachabilityMonitor`；应用不装 sync、从不 `watch()` → 空 tick 循环每 30s 跑一次直到页面关闭。与模块自述不变量（构造「对宿主零副作用」、「退避节拍与引用计数同生共死」）相悖。
- 建议：`#scheduleWakeup()` 加 `#watchers > 0` 守卫，或把初始 navigator 读取推迟到首个 `watch()`。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
