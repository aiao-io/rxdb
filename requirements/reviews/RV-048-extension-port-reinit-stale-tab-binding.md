---
id: RV-048
title: 扩展 port 重新 INIT 后旧 tab 路由残留且断开未清理
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-048：扩展 port 重新 INIT 后旧 tab 路由残留且断开未清理

## 问题

🔴 **P2，确认问题，待修复。** 同一 panel port 先完整协议 INIT 到 tab7，再 INIT 到 tab8。后续命令路由已是 tab8，但 tab7 的上行数据仍能送进该 panel；disconnect 仅删除 tab8 映射，tab7 仍指向已经断开的 port。

## 根因

[background-core.connect](../../apps/rxdb-devtools-extension/src/background/background-core.ts) 第 149–152 行重写 connectedTabId 并给新 tab 设置 ports，但没有撤销旧 tab→port 关联。第 177–188 行断开只清理最后一次 connectedTabId；第 201–206 行 receiveContent 则直接按残留 map 发消息。

原来的“旧 port 断开不删除新 port”身份守卫覆盖不同 port 替换，没有覆盖同一 port 更换 tab。问题是扩展内部绑定/生命周期，不宣称网页可以伪造受信 panel port 或已经构成跨权限泄露。

## 复验

[background-core.spec.ts](../../apps/rxdb-devtools-extension/src/background/background-core.spec.ts) 加入重复同 tab / 更换 tab 两种形态，各检查活动绑定与 disconnect 清理。消息通过真实 wire guards，实际 background controller；Chrome port/injection 为测试接缝。

新增 **2 failed /2 passed**，单文件整体 **2 failed /23 passed**：[日志](evidence/2026-10-04/tree-devtools/extension-reinit-binding.txt)。测试不强迫支持更换 tab：实现可以拒绝第二次 INIT 或原子重绑，但只能有一个活动绑定，断开后都不得再转交。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-devtools-extension:test --args='src/background/background-core.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

本轮没有在真实 Chrome DevTools GUI 执行重复 INIT，也没有验证后台 service worker 崩溃；确认的是真实 controller 的旧数据转交和旧映射残留。

## 修复方案

明确 INIT 是一次性身份绑定，重复异 tab 时拒绝；或以 port 身份为单位原子撤销旧 tab/session/activation 再绑定新 tab。disconnect 撤销该 port 仍拥有的所有关联，保留“旧 port 不能删除新 port”的 identity guard。

补 pending injection 中重绑/断开、相同 tab 重复、不同 port 替换、旧 session DISCONNECT 清理，并接实际 Chrome conformance。不要扩大 manifest 权限或用错误捕获掩盖残留映射。

## 解决记录

- [x] 控制器失败复验与同 tab 对照保留；业务实现未改。
- [ ] 修复单一绑定与释放不变量，补实际宿主验证。
- [ ] 当前 Open。
