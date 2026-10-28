# rxdb-react 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-react`。

## 结论

🟡 凑合。发现 3 条 P2：Provider 切换异步 source 时暴露旧数据库、Activity 重显复用已销毁的 Promise 结果，以及 useAction 在 layout effect 中执行旧回调。

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


### RRE-20261028-02 [P2] Activity 隐藏后销毁 owned Promise 结果，重显又提供同一已销毁实例

证据：[`closeLease` / `openLease` / `useResolvedRxDB`](../../../packages/rxdb-react/src/rxdb-react.tsx)。Provider 将 Promise source 判为 owned。Activity 隐藏清理 effect 时，closeLease 在下一个微任务把租约标为 closed，再对已解析数据库调用 destroy。Activity 保留组件状态并在重显时重新接通 effect；openLease 不复用 closed 租约，创建的新租约却仍然解析同一个稳定 Promise，得到的还是已经销毁的数据库。Provider 没有重新创建或连接该实例。

最小触发：将稳定 `Promise.resolve(database)` 作为 db prop，把 Provider 放在 `<Activity>` 内，先 visible 并等待数据库就绪；切 hidden，等清理微任务执行，再切回 visible。预期重新提供的数据库仍能服务消费者；实际隐藏期间已执行 destroy，重显又把同一对象作为 ready db 提供。

复验：当前真实 provider 源码经 esbuild 仅在内存中转译，使用同一 React/ReactDOM 19.3.1 和 happy-dom；仅数据库替身记录 destroy 和 dead 标记，未替换 Provider、租约、Activity 或 hooks。原输出为：

```text
initial: destroys=0, dead=false
hidden: destroys=1, dead=true
shown: useRxDBOptional() -> { id: 'owned', dead: true }
```

影响与限定：合法稳定 Promise source 的页面隐藏/重显后，context 把已拆卸实例当作可用库，消费者没有获得新的就绪过程。此复现未使用真实存储，不能据此声称已经验证持久数据丢失。直接传入已就绪实例由调用方持有、不进入此清理路径；能每次真正新建数据库的 factory 也不同于本条稳定 Promise 触发。

修复建议：把 provider 的资源所有权与 Activity 断开/重接契约一起设计；不能在重显时重新等待已经销毁结果的同一个 Promise。若 owned Promise 无法可靠重建，应在公开合同和运行时明确处理该组合，或将清理/重建安排到能够维持数据库可用性的资源层，不能只把 closed 标志清回 false。

建议回归：稳定 Promise 已解析和未解析两种时刻隐藏、微任务之后重显、重复隐藏/显示、真正卸载；同时以直接实例和返回新库的稳定 factory 作对照。断言重显时不会向消费者交付已销毁对象，真实卸载仍能收回 owned 资源。


### RRE-20261028-03 [P2] useAction 在新提交的 layout effect 中仍执行旧回调

证据：[`useAction`](../../../packages/rxdb-react/src/use-action.ts) 通过 passive `useEffect` 更新 `latest.current = promiseFn`，execute 则固定调用这个 ref。公开 ActionResource 合同明确承诺 execute 始终调用“最新一次渲染”传入的函数。新提交的 layout effect 发生在该 passive effect 之前，因此期间调用 execute 仍读到旧闭包。源码注释“execute 从 effect 调用时，effect 早已提交”不能覆盖 layout effect。

最小触发：组件先以 target=A 渲染 `useAction(() => save(target))`，其 `useLayoutEffect([target, execute])` 调用 execute；然后把 target 切成 B，仍由同一 layout effect 执行自动保存。预期执行 B 的回调；实际执行上一轮 A 的回调。函数引用稳定与目标正确是两个要求，当前只保证前者。

复验：真实 use-action.ts 经内存转译，ReactDOM 19.3.1 + happy-dom；只用记录 target 的异步函数替代业务保存，没有替换 hooks 或提交顺序。A 提交结束后清空记录，再提交 B，输出：

```json
{"committedTarget":"B","actualCallbackTargets":["A"]}
```

影响与限定：依赖新 props 在 layout effect 执行的自动操作可能使用旧记录/旧库闭包。本条证明错误 callback 被调用，未使用真实数据库，也不声称已经复现持久写错记录。等待 passive effect 完成后再触发的普通点击通常不落在该窗口；Angular/Vue action 在创建时捕获函数的合同与 React 的“每次渲染更新函数”不同，不重复登记到另外两包。

修复建议：在提交阶段、允许消费者 layout effect 调用之前更新有效回调，并验证父子组件 layout effect 顺序与并发 render，不能在尚未提交的 render 中无条件写共享 ref。将 execute 可调用时机与“最新回调”的契约写清。

建议回归：同组件 layout effect 和父组件 layout effect 调用、事件调用、A→B 反序并发 render、错误与并发计数恢复；断言 actual callback target 与当前已提交目标一致。

## 公开 API 与三端对照

公开查询/同步/持久化/Graph 共享类型与 Angular/Vue 对齐；source 允许实例、Promise、工厂。此问题发生在同一合法 Provider 实例的 source 替换，和“内联不稳定工厂”是不同触发条件。

## 验证与边界

完成上述真实 provider 隔离复验，并审阅 [`rxdb-react.spec.tsx`](../../../packages/rxdb-react/src/__tests__/rxdb-react.spec.tsx) 已有异步 source 与 StrictMode 覆盖；现有文件未覆盖 source 替换的首个 layout 提交。

本次 `rxdb-react:test`：205 passed (205)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：没有用两个真实存储库复验切换，也没有验证未完成并发 render 的全部调度交错。useAction 的 layout effect 调用窗口已由 RRE-20261028-03 的真实 hook 复现覆盖；更广的并发调度仍未穷举。
