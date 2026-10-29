# rxdb-vue 深度评审

评审日期：2026-10-29。源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。范围：`packages/rxdb-vue`。

## 结论

🟢 好。本更新轮未发现新的确定问题；新增问题 0 条。模型层对同步快照的误用已随 model-vue #169 消除，见 [rxdb-model-vue](rxdb-model-vue.md)。

## 检查范围与证据

- 阅读 [`createSlot` / `createInjection` / `makeRxDBDependencyInjector` / `useRxDBOptional` / `useRxDBRef`](../../../packages/rxdb-vue/src/rxdb-vue.ts)、[`useRepositoryQuery`](../../../packages/rxdb-vue/src/hooks.ts)、[`useInfiniteScroll`](../../../packages/rxdb-vue/src/useInfiniteScroll.ts)、[`useEntityChange`](../../../packages/rxdb-vue/src/use-entity-change.ts) 及 action/同步状态入口。
- 异步 source 就绪填入 shallowRef，已销毁 scope 的迟到实例销毁；调用方 Ref 和同步实例不被 provider 接管。每套注入器各有 Symbol，未发现跨上下文串库。
- 查询选项以内容 key 触发重查，scope 销毁使 requestId 无效；图数组复制保留 truncated 描述符。分页同时观察 databaseRef 与 optionsKey，异步 source 后到可以启动查询。
- 2026-10-29 变更（a808f770，#169）：[`injectRxDBRef`](../../../packages/rxdb-vue/src/rxdb-vue.ts) 增加可选 `quiet` 参数——为真时走 `inject(RxDBKey, undefined)` 静默读取，避免可选注入在 dev 下发出 Vue 未找到注入的警告；既有 `injectRxDB()`（调 `injectRxDBRef()` 不带 quiet）行为不变。配套测试覆盖迟到就绪与无 provider 两条路径，README 同步说明。

## 确定发现

无。`useRxDBOptional()` 的返回值是调用时快照；响应式等待由 `useRxDBRef()` / `injectRxDBRef()` 提供，不能把所有快照读取本身都报成 provider 缺陷。2026-10-29 复核：`injectRxDBRef(quiet?)` 为向后兼容的纯增量变更（可选参数 + 静默注入路径），未改变任何既有语义，未发现新问题。

## 公开 API 与三端对照

源码实际入口提供三端公共 Source、查询/Graph 资源、action、持久化和同步状态。Vue 额外接受 Ref/undefined 并提供 Ref injector，和 React 组件重渲染、Angular bootstrap 等待的响应式机制不同。

## 注入与作用域反证检查

`createSlot` 对调用方 Ref 直接保留该 Ref，对 owned source 单独登记 onScopeDispose；迟到 resolve 根据 disposed 清理，未将 caller-owned Ref 的替换误判为必须由 provider 销毁旧库。`useRepositoryQuery` 有 requestId 与内容 key，`useInfiniteScroll` 读取响应式 databaseRef；model-vue EntityDetail 已改用 `injectRxDBRef(true)` 等待异步 source（#169），此前的快照缺口不归 provider。

## 验证与边界

对照 [`rxdb-vue.spec.ts`](../../../packages/rxdb-vue/src/__tests__/rxdb-vue.spec.ts)、[`useInfiniteScroll.spec.ts`](../../../packages/rxdb-vue/src/__tests__/useInfiniteScroll.spec.ts)、[`tri-framework-provider.spec.ts`](../../../packages/rxdb-vue/src/__tests__/tri-framework-provider.spec.ts)。本轮 rxdb-vue.spec.ts 新增 16 行 1 个用例（静默注入 + 迟到就绪 + 无 provider 可选语义）；本轮评审只做静态核对，未重新运行测试目标。

首轮（2026-10-28）`rxdb-vue:test`：227 passed (227)；目标实际执行。命令及整体边界见[总索引](README.md)。

已知组合边界（更新）：model-vue EntityDetail 已改用 `injectRxDBRef(true)` 等待异步 source，edit 加载与 create 草稿补建（metadata 路径）已覆盖（#169）；纯路由输入 create 模式的剩余边界见 [rxdb-model-vue](rxdb-model-vue.md)。未执行 Nuxt/SSR 与真实多框架同页混用验收。
