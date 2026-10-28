# rxdb-vue 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-vue`。

## 结论

🟢 好。本次检查范围内未发现确定缺陷；新增问题 0 条。模型层对同步快照的误用另见 model-vue 的已知边界。

## 检查范围与证据

- 阅读 [`createSlot` / `createInjection` / `makeRxDBDependencyInjector` / `useRxDBOptional` / `useRxDBRef`](../../../packages/rxdb-vue/src/rxdb-vue.ts)、[`useRepositoryQuery`](../../../packages/rxdb-vue/src/hooks.ts)、[`useInfiniteScroll`](../../../packages/rxdb-vue/src/useInfiniteScroll.ts)、[`useEntityChange`](../../../packages/rxdb-vue/src/use-entity-change.ts) 及 action/同步状态入口。
- 异步 source 就绪填入 shallowRef，已销毁 scope 的迟到实例销毁；调用方 Ref 和同步实例不被 provider 接管。每套注入器各有 Symbol，未发现跨上下文串库。
- 查询选项以内容 key 触发重查，scope 销毁使 requestId 无效；图数组复制保留 truncated 描述符。分页同时观察 databaseRef 与 optionsKey，异步 source 后到可以启动查询。

## 确定发现

无。`useRxDBOptional()` 的返回值是调用时快照；响应式等待由 `useRxDBRef()` / `injectRxDBRef()` 提供，不能把所有快照读取本身都报成 provider 缺陷。

## 公开 API 与三端对照

源码实际入口提供三端公共 Source、查询/Graph 资源、action、持久化和同步状态。Vue 额外接受 Ref/undefined 并提供 Ref injector，和 React 组件重渲染、Angular bootstrap 等待的响应式机制不同。

## 验证与边界

对照 [`rxdb-vue.spec.ts`](../../../packages/rxdb-vue/src/__tests__/rxdb-vue.spec.ts)、[`useInfiniteScroll.spec.ts`](../../../packages/rxdb-vue/src/__tests__/useInfiniteScroll.spec.ts)、[`tri-framework-provider.spec.ts`](../../../packages/rxdb-vue/src/__tests__/tri-framework-provider.spec.ts)。

本次 `rxdb-vue:test`：227 passed (227)；目标实际执行。命令及整体边界见[总索引](README.md)。

已知组合边界：model-vue EntityDetail 在 setup 只取 optional 快照，异步 source 后到时不会补载实体或创建草稿；这是前次清理记录已明确的事实，本次未作为新发现重报。未执行 Nuxt/SSR 与真实多框架同页混用验收。
