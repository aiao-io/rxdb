# R2-08：rxdb-plugin-working-tree-vue 原 C 边界交接

本轮不扩发现，不新增正式 RV/严重度编号，不改业务或原 tests。原有 registry 的 RV-069（P1，React 切 provider 的 ownership）只作为对照；Vue 的固定快照不是未经测量就可合并的同一缺陷。

## 仅交回原 C1/C2/C3/C4 的生命周期裁定

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:150-157` 与 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/rxdb-vue.ts:225-237`：setup 取一次实例，commands 捕获该库。provider Ref 替换不会迁移现存 resource；provider 函数是异步解析的一次性 factory，不是响应式 getter。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:125-137`：latest-only 按 state key；不是库/分支/scope token。状态代次不取消底层事务。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts:150-174`：没有 watch/onScopeDispose/onUnmounted/disposing。组件 watcher 的释放不能替命令 patch 或外部 retained diff 的清除。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:205-210,289-298`：versionManager getter 是每次从已捕获数据库现取 manager；不能误称支持动态库 getter。

最小特征化：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-vue/src/__tests__/review-round2-lifecycle.spec.ts`，9 场景，尚未运行。其快照/晚到 patch 断言记录当前行为，不应将“特征化通过”标成原 C 的“不显示旧库 diff/关闭清理/新输入生效”通过。主控测量后裁定是否作为已知限制、原 C 的确认问题或必要未验分流；本任务不预判正式编号。

其余原场景及精确补证面见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/c-evidence.json` 和 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-working-tree-vue/closure.json`。没有新扩展功能族问题。
