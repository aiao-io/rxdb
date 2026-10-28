# rxdb-react 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-react`。

## 结论

🟡 凑合。发现 1 条 P2：Provider 切换异步 source 时，首次已提交渲染仍暴露旧数据库。

## 检查范围与证据

- 阅读 [`useResolvedRxDB` / `openLease` / `closeLease` / `makeRxDBProvider`](../../../packages/rxdb-react/src/rxdb-react.tsx)、[`useRepositoryQuery`](../../../packages/rxdb-react/src/hooks.ts)、[`useInfiniteScroll`](../../../packages/rxdb-react/src/useInfiniteScroll.ts)、[`useAction`](../../../packages/rxdb-react/src/use-action.ts)、[`useEntityChange`](../../../packages/rxdb-react/src/use-entity-change.ts) 以及状态 hooks 的入口。
- 查询 hook 的 identity 变更在 render 复位资源元信息，在 layout effect 失效旧请求；provider 未采用同一身份归属检查。
- 检查 StrictMode 租约接手、真实卸载的迟到 resolve、查询选项内容去重、分页重锚、实体变更订阅和错误容器。

## 确定发现

### RRE-20261028-01 [P2] 新 source 的首个提交仍返回旧 source 的 db

证据：[`useResolvedRxDB`](../../../packages/rxdb-react/src/rxdb-react.tsx) 把解析结果保存在无 source 身份的 `state` 中；返回值始终为：

```ts
({ db: ready ?? state.db, failure: state.failure, pending });
```

source 从已解析 A 换成尚未解析 B 时，`ready` 为 undefined，`state.db` 仍为 A；只有旧 passive effect cleanup 才执行 `setState(UNRESOLVED)`。新 props 的 commit 和子树 layout effect 已经能观察 A。

最小触发：稳定 Promise A 解析出库 A；保持同一 Provider 实例，将 db prop 换成稳定且挂起的 Promise B；子组件在 useLayoutEffect 记录 useRxDBOptional 的结果。预期新 source 自首个提交起返回 undefined；实际先返回 A，然后才返回 undefined。

复验：当前真实 provider 源码经内存转译，在 React DOM + happy-dom 中运行；仅用带 id/destroy 的轻量数据库对象替代存储后端。已提交的 layout 快照为：

```text
source A -> unresolved B, committed layout snapshots: ["A","loading"]
```

影响：切库首帧仍能读取旧库，消费者对 db 变化的订阅会先看到错误实例。已证实的是旧库泄露窗口，未在此推断或声称跨库写入已经发生。

修复建议：解析状态附带 source 身份，render 只返回属于当前 source 的 db/failure；换 source 的首帧使用未解析状态，保留现有 lease 的所有权与销毁机制。

建议回归：A 已解析→B 挂起、A 失败→同步 B、A/B 反序解析、同步实例→工厂；在子组件 layout effect 中断言，避免只等 passive effect 跑完再检查而漏掉首帧。

## 公开 API 与三端对照

公开查询/同步/持久化/Graph 共享类型与 Angular/Vue 对齐；source 允许实例、Promise、工厂。此问题发生在同一合法 Provider 实例的 source 替换，和“内联不稳定工厂”是不同触发条件。

## 验证与边界

完成上述真实 provider 隔离复验，并审阅 [`rxdb-react.spec.tsx`](../../../packages/rxdb-react/src/__tests__/rxdb-react.spec.tsx) 已有异步 source 与 StrictMode 覆盖；现有文件未覆盖 source 替换的首个 layout 提交。

本次 `rxdb-react:test`：205 passed (205)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：没有用两个真实存储库复验切换，也没有验证未完成并发 render 的全部调度交错。useAction 的最新 callback 在 passive effect 中更新，以及 Activity 对拥有型 Promise source 的重接行为，均需单独契约与用例，本报告不把这些未复现风险计为确定问题。
