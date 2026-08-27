# packages/rxdb 深度代码评审

> 评审范围：`packages/rxdb/src` 生产源码。结论只覆盖当前工作区代码；`dist` 与测试快照不作为生产行为依据。

## 结论

整体架构成熟度较高：实体缓存、活查询增量合并、分支同步、迁移认领和插件生命周期都有明确的边界设计，测试痕迹密集。但公共生命周期与同步入口仍有几个用户可直接触发的正确性缺口，需要在发布前处理。

## Findings

### 🔴 P1 `disconnect()` 无法取消或等待仍在进行的 `connect()`

- 位置：[RxDB.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb/src/RxDB.ts:653)
- `connect()` 在真正 `getAdapter()` 之前就把 pending promise 写入 `#connect_promise_map`；`disconnect()` 却只读取 `#adapter_map`。适配器工厂、`adapter.connect()`、建表或迁移尚未完成时调用 `disconnect()`，会因为 `cached === undefined` 直接返回。
- 后续影响：
  - `disconnect()` 已 resolve，调用方会认为停机完成；
  - 原 `connect()` 继续执行，完成建表/迁移后调用 `#set_adapter_connected()`；
  - 插件安装继续进行，实例重新进入已连接状态；
  - 全局 shutdown 没有被执行，事件、网关、查询与 repository 缓存保持存活。
- `disconnectAll()` 虽然也只从 `#adapter_map` 取实例，但 `#shutdown()` 会复位初始化状态并释放连接纪元，测试里明确覆盖了在飞 connect 的窗口；普通 `disconnect()` 缺少同等语义。
- 改进：普通 `disconnect()` 必须同时查看 `#connect_promise_map`。至少要等待/裁决 pending connect，并保证断开请求之后不会再把该适配器标记为 connected；对已经进入插件安装阶段的链路要执行对应清理。补一个“connect 卡在 adapter.connect，期间调用 disconnect，随后放行 connect”的并发测试。

## 已验证

- `pnpm nx run rxdb:lint --skipRemoteCache`：通过。
- `pnpm nx run rxdb:typecheck --skipRemoteCache`：通过。

## 继续评审中的候选

以下问题尚未定级，不能直接当作结论：

- pull/push 的 `limit`、`batchSize` 是否需要统一拒绝非正数、非整数、非有限数。
- `emitEvent()` 是否应与 `dispatchEvent()` 一样按 listener 隔离异常，避免事务排空时一个监听器阻断后续事件。
- entity numeric ID 编解码是否必须强制 safe integer。
