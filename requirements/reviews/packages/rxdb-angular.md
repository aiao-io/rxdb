# rxdb-angular 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-angular`。

## 结论

🟢 好。本次检查范围内未发现确定缺陷；新增问题 0 条。

## 检查范围与证据

- 阅读 [`createHolder` / `provideRxDB`](../../../packages/rxdb-angular/src/rxdb.provider.ts)、[`useRepositoryQuery`](../../../packages/rxdb-angular/src/hooks.ts)、[`InfiniteScrollingList`](../../../packages/rxdb-angular/src/InfiniteScrollingList.ts)、[`useInfiniteScroll`](../../../packages/rxdb-angular/src/use-infinite-scroll.ts)、[`useAction`](../../../packages/rxdb-angular/src/use-action.ts)、[`usePersistedState`](../../../packages/rxdb-angular/src/use-persisted-state.ts)、[`useSyncState`](../../../packages/rxdb-angular/src/use-sync-state.ts) 与[实体变更指令](../../../packages/rxdb-angular/src/rxdb-change-detector.directive.ts)。
- provider 区分实例与工厂/Promise 所有权，迟到 resolve 后也由 DestroyRef 销毁；根级 initializer 在组件创建之前等待就绪，失败保留给 require 原样抛出。
- 分页检查 limit 0、无 next 直接 complete、前页边界变化后重锚、刷新代次、销毁后的 loadMore/refresh 空操作；action 在途计数置于 finally。

## 确定发现

无。根 provider 不能套用 Vue 模型层的异步快照缺陷；它在根 bootstrap 前已等完异步 source。

## 公开 API 与三端对照

对比三端实际 index.ts：`RxDBSource`、查询资源、GraphPath / GraphQueryResult / NeighborResult、useAction、usePersistedState、useSyncState 均存在。Signal、React 快照与 Vue reactive/ComputedRef 的差异属于各框架容器，不能按字符串逐字相同判 API 缺失。

## 验证与边界

审阅 provider 的异步失败合同和查询/分页实现；基线用例入口包括 [`rxdb.provider.spec.ts`](../../../packages/rxdb-angular/src/__tests__/rxdb.provider.spec.ts)、[`InfiniteScrollingList.spec.ts`](../../../packages/rxdb-angular/src/__tests__/InfiniteScrollingList.spec.ts)、[`tri-framework-provider.spec.ts`](../../../packages/rxdb-angular/src/__tests__/tri-framework-provider.spec.ts)。

本次 `rxdb-angular:test`：266 passed (266)；目标实际执行。命令及整体边界见[总索引](README.md)。

已文档化限制：`provideAppInitializer` 只在根环境注入器自动等待；路由级异步 source 的 loading 要由宿主负责。未验收路由级注入器在真实应用中的组合生命周期，也未测本包独立发布后的 SSR 消费。
