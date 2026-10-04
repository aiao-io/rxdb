---
id: RV-042
title: workspace 旧初始化结算污染新连接纪元并复活已删除草稿
status: Open
created: 2026-10-04
updated: 2026-10-04
severity: P2
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-042：workspace 旧初始化结算污染新连接纪元并复活已删除草稿

## 问题

🔴 **确认问题，待修复。** 第一次 install 的 IDB 读取仍在等待时释放作用域、重新 install；旧读取随后成功或失败，会修改新纪元的恢复标记。已在新恢复窗口收到的删除事件被遗忘，旧快照中的草稿重新进入缓存；或已成功的新安装被误标成失败，重复 install 又发起一次读取。

## 根因与源码证据

[RxDBPluginWorkspace.install](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts) 第 328–335 行的 catch/finally 无条件写实例字段 `#installFailed`、`#restoring`，并清空 `#restore_delete_intents`。这些字段属于**当前**纪元，而回调可能来自已经释放的上一个 install。

[restoreEntries](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts) 第 528–537 行已经按 store 身份拒绝旧读取回填缓存；但返回后旧 install 的 finally 仍执行，绕过了这个保护。第 563–568 行用于拒绝过时快照的删除意图恰好被清掉。[releaseEpochState](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts) 第 493–524 行的复位也挡不住之后才结算的旧 Promise。

## 动态复验

在 [既有 workspace 单元套件](../../packages/rxdb-plugin-workspace/src/__tests__/RxDBPluginWorkspace.spec.ts) 追加“评审：workspace 旧安装结果不能修改新纪元”四例，使用实际插件和 LifecycleScope，IDB entries / RxDB 事件来源为既有测试接缝：

- 旧读取先完成、新读取后完成：删除意图消失，`cacheCount` 实际 **1**，预期 **0**；反顺序对照通过。
- 旧读取在新安装成功后拒绝：重复 install 返回另一 Promise、重新读存储；旧错误先于重新安装结算的对照通过。

新增 **2 failed / 2 passed**；此单文件整体 **2 failed / 80 passed**：[日志](evidence/2026-10-04/workspace-install-epoch.txt)、[状态](evidence/2026-10-04/workspace-install-epoch-status.json)。没有用 arbitrary sleep 控制先后，两个读取由明确的 resolve/reject gate 排序。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-workspace:test --args='src/__tests__/RxDBPluginWorkspace.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

本轮确认的是 install 结算和缓存恢复语义，**不是主表已删除行复活**；没有执行真实 IndexedDB 重开/真实 RxDB connect 的同场景复验。真实宿主补证保持待执行。

## 修复方案

为 install 结算保存本次 Promise/store/纪元身份，catch/finally 只有仍属于当前安装时才更新恢复标记、失败状态和删除意图。过期 Promise 仍按自己的结果结算给旧调用方，不能吞掉旧错误，也不能让它写新状态。与 restoreEntries / flush 已有的 store 身份规则保持一致。

补旧 success/reject 的四种排序、新恢复窗口内 REMOVE/CREATE/跨页 remove、释放后再次 install 的对照。上轮 C3 flush 专题的局部通过不代表这条 C2→C3 组合链路已安全。

## 解决记录

- [x] 保留两个失败复验及顺序对照；业务实现未修改。
- [ ] 修复安装结算的纪元归属，补真实 IDB / connect 补证。
- [ ] 当前仍 Open。
