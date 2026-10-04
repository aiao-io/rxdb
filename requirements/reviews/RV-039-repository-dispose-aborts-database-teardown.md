---
id: RV-039
title: 仓储销毁抛错会中断数据库拆卸并残留实体类绑定
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P1
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-039：仓储销毁抛错会中断数据库拆卸并残留实体类绑定

## 问题

🔴 **确认问题，待修复。** 一个已构造的仓储 `destroy()` 抛错，会使 `RxDB.destroy()` 提前结束，已连接 adapter 的 `disconnect()` 完全未被调用，实体类也没有解绑。新建另一个使用同一实体类型的数据库后，静态构造入口报“registered with multiple RxDB instances”。第一次 `destroy()` 已把实例标成终态，再调用一次也不会补做拆卸。

## 根因与源码证据

1. [EntityManager.cleanAllCache / destroy](../../packages/rxdb/src/entity/entity-manager.ts) 第 206–221 行按 `forEach` 销毁仓储。任一项抛错即中断：缓存清空和 `unregisterEntityManager` 都在后面，没有 finally 或跨项隔离。
2. [RxDB.#shutdown](../../packages/rxdb/src/RxDB.ts) 第 1594–1608 行把 `entityManager.destroy()` 放在状态复位之前。异常还会跳过连接/初始化状态的复位。
3. [RxDB.disconnectAll](../../packages/rxdb/src/RxDB.ts) 第 1253 行的 `await #shutdown()` 在负责 adapter 断连与清空 map 的 try/finally **之外**。
4. [RxDB.destroy](../../packages/rxdb/src/RxDB.ts) 第 1287–1303 行先标记 `#destroyed = true`；后续调用直接返回。其 finally 只销毁 syncState / reachability，不能补齐仓储与 adapter 清理。

用户可通过公开 `repository(...)` 接入自定义仓储；内置 [Repository.destroy](../../packages/rxdb/src/repository/Repository.ts) 也会调用 QueryCache session / query manager 的清理。这里不是要求隐藏 cleanup 错误，而是要求错误传播与其它资源释放同时成立。

## 动态复验

[复验 spec](../../packages/rxdb/src/__tests__/review-repository-teardown.spec.ts) 使用实际 RxDB、实际 EntityManager、实际仓储与动态定义的实体类，通过公开 repository 接线注入清理错误。adapter 使用项目现有测试适配器。

**2 failed / 1 passed**：[日志](evidence/2026-10-03/follow-up/repository-teardown.txt)、[状态](evidence/2026-10-03/follow-up/repository-teardown-status.json)。分别确认 adapter.disconnect 调用次数是 **0**、下一库的实体构造被旧 manager 绑定阻断；正常销毁对照均通过。每例 finally 显式释放故障注入后的测试资源，不污染后续用例。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb:test --args='src/__tests__/review-repository-teardown.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

本轮没有用真实数据库连接或 OS 句柄测资源泄漏的数量/时长，不宣称已经测出真实 Web Lock 永久占用；已证明核心未调用约定的适配器关闭入口和未解除实际实体绑定。P1 来自停机失败后实例进入不可重试终态、并破坏后续实例可用性。

## 修复方案

按阶段完成所有必需拆卸，再传播首个/聚合错误：仓储逐项隔离，实体解绑与缓存清空放在保证执行的收尾段；shutdown 的状态复位不依赖某个子资源成功；adapter 断连必须覆盖 shutdown 抛错路径。保留现有错误可见契约，不用 catch 后静默成功，也不放宽实体多库歧义保护。

补多个仓储中的首项/中间项失败、adapter 也失败、断开重连、destroy 重入的回归；其它错误路径是否充分清理仍须分别核查。

## 解决记录

- [x] 保留两个失败复验及正常销毁对照；未修改业务实现。
- [ ] 修复各拆卸阶段的异常边界，保持原始异常可见。
- [ ] 复跑连接/插件/实体生命周期与真实宿主关闭回归；当前仍 Open。
