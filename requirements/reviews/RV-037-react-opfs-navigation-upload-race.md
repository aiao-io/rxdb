---
id: RV-037
title: React 切换 OPFS 目录未完成时上传文件写入旧目录
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-037：React 切换 OPFS 目录未完成时上传文件写入旧目录

## 问题

🔴 **确认问题，待修复。** 点击目录后 URL 已切到目标目录，但目录句柄仍在读取时，“上传文件”按钮继续可点。此时选中的文件会静默落到上一个目录。目标目录随后完成加载，列表里看不到刚上传的文件；用户看到的路由与实际落盘位置不一致。

## 根因与源码证据

- [useOpfsRouteSync](../../apps/dev-rxdb-react/src/app/pages/opfs/hooks/useOpfsRouteSync.ts) 第 19 行以 `void navigateTo(routePath)` 启动异步读取，不提供目录就绪屏障。
- [useOpfsService](../../apps/dev-rxdb-react/src/app/pages/opfs/hooks/useOpfsService.ts) 第 45–78 行在读取完成后才更新 `currentPath` / `currentHandleRef`；第 114–137 行的 `uploadFile` 默认取闭包中的旧 `currentPath`。
- [OpfsPage](../../apps/dev-rxdb-react/src/app/pages/opfs/opfs.tsx) 第 508–514 行没有在目录切换中禁止上传，第 209–227 行也没有把选中的目标路由/句柄固定下来。

## 动态复验

[复验 spec](../../apps/dev-rxdb-react-e2e/src/review-opfs-navigation.spec.ts) 使用真实 Chromium、当前 production build 和真实 OPFS：仅用可释放的 Promise 延迟目标目录的原生 `getDirectoryHandle`，其余读取、写入与关闭均调用原生实现。复验通过实际点击“上传文件”按钮和 file chooser 选文件，不绕过 UI 直接调用服务。

**1 failed / 1 passed**：[执行日志](evidence/2026-10-03/follow-up/react-opfs-real-upload.txt)、[状态](evidence/2026-10-03/follow-up/react-opfs-real-upload-status.json)、[实际落盘快照](evidence/2026-10-03/follow-up/react-opfs-disk-snapshot.json)。URL 在目标目录时，根目录文件内容是 `review-navigation-content`，目标目录没有该文件；等待目录加载的对照正常写入目标目录。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run dev-rxdb-react-e2e:e2e --args='src/review-opfs-navigation.spec.ts --workers=1 --retries=0' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

上轮两个取消操作 E2E 的原始用例单独复跑 **2 passed**，见 [日志](evidence/2026-10-03/follow-up/react-opfs-baseline.txt)。原 [openIsolatedFolder](../../apps/dev-rxdb-react-e2e/src/opfs.spec.ts) 第 28–29 行只等始终存在的上传按钮，不证明目录加载完成。这能解释同类症状，但没有保存足够的上轮运行时状态，不能把两次历史失败都追认为同一次竞态，更不能称“取消删除导致文件丢失”。

## 修复方案

建立明确的目录切换/就绪状态，切换完成前禁止上传等依赖当前句柄的写操作；或在操作开始时显式解析并固定目标路由对应的目录句柄。处理读取失败时要显示失败，不能退回旧目录写入。E2E 等目标目录的实际加载状态，并在磁盘上验证内容和父目录，不能只等工具栏可见。

补快速连续导航、读取失败、上传中导航、覆盖/删除取消的回归。其它框架的 OPFS 页面未执行本次竞态对照，不外推为三端均有问题。

## 解决记录

- [x] 保留真实浏览器失败复验与正常对照；未修改业务实现。
- [ ] 修复目录就绪屏障并复跑 OPFS E2E。
- [ ] 补三端相同竞态的对照；当前仍 Open。
