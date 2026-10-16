# Review：@aiao/rxdb 评审

## 结论

🟡 二次评审发现 1 条 P2：游标分页的重锚判据只比游标 id、不比排序键值，排序键被编辑时边界行会跨页重复、后续行丢失（三端无限滚动同源）。

## 检查范围

检查 `RxDB.ts`、`Repository.ts`/`QueryManager.ts`、`rxdb.transaction.ts`、插件调度器、实体权限/约束、同步契约、backup/capture/system 目录及其 `src/__tests__`；核对 `package.json`、`project.json` 的 build/typecheck/test inputs、exports 和 SKILL 生成目标。二次评审额外核对了 `findByCursor` 的游标规则生成时机与三端无限滚动的重锚守卫。

## 发现

### P2：`findByCursor` 的游标规则在订阅期只生成一次，排序键被编辑后重锚判据失效——边界行跨页重复、后续行丢失

- 证据：`src/repository/Repository.ts:391-401` 中 `_generate_cursor_rule_group(normalized)` 在 `findByCursor` 调用期执行一次，把游标的**排序键取值**烘焙进 `new_where`，runner 闭包每次 refresh 复用同一份谓词；三端无限滚动的重锚守卫只比较游标 id：React `packages/rxdb-react/src/useInfiniteScroll.ts:205`、Vue `packages/rxdb-vue/src/useInfiniteScroll.ts:238`、Angular `packages/rxdb-angular/src/InfiniteScrollingList.ts:304`（`cursorId(...) !== cursorId(tail)` 即不重锚）。
- 触发：`orderBy [name asc, id asc]`、limit 10、已加载两页；把第 1 页尾行（第 10 行的锚点）`name` 从 `Jade` 改成 `Jasmine`（仍在第 9 与第 11 行之间）。第 1 页重发后尾行 id 不变 → 不重锚；第 2 页沿用旧谓词 `name > 'Jade'`，改名后的锚点行自身落入第 2 页 → 第 10 行跨页重复、第 20 行从并集消失；此后第 2 页每次刷新持续用旧锚点，直到锚点行离开该页或用户手动 refresh。
- 建议：重锚判据比较游标实体的 orderBy 投影值（不止 id），或把 `_generate_cursor_rule_group` 移进 runner 让每次重跑从活锚点实体重读当前排序键值。

## 风险/未覆盖

未覆盖真实 SQLite/PGlite 竞争、跨 tab 广播、崩溃恢复和大数据量性能；这些需适配器契约及真实宿主运行。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
