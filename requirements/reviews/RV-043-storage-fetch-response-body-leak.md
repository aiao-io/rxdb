---
id: RV-043
title: 文件拉取在响应头阶段拒绝后没有取消响应体
status: Open
created: 2026-10-04
updated: 2026-10-04
severity: P2
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-043：文件拉取在响应头阶段拒绝后没有取消响应体

## 问题

🔴 **确认问题，待修复。** `storage.fetch` 收到非成功状态、或成功响应缺少 MIME 时会立即拒绝，但不读取或取消响应体。调用方已收到错误、甚至 `storage.destroy()` 已完成，底层 HTTP 下载仍能继续。

## 根因与源码证据

[fetchToOpfs](../../packages/rxdb-plugin-storage/src/storage.ops.ts) 第 68–76 行在检查 `response.ok` / Content-Type 时直接 throw，位于第 82–101 行负责流式写入与临时文件清理的 try/finally 之外。这里没有 response.body.cancel，也没有其它请求终止入口。

[RxdbFileStorage.fetch](../../packages/rxdb-plugin-storage/src/storage.service.ts) 第 311–320 行在 task 拒绝后清掉 inFlight 和 pending write 登记；因此销毁只看到已结束的业务任务，不会再处理这个未消费的响应体。错误信息与文件补偿不是本问题，资源归属丢失才是。

## 真实 HTTP 复验

[复验 spec](../../packages/rxdb-plugin-storage/src/__tests__/review-fetch-response-cleanup.spec.ts) 强制 Node 测试环境，使用本机实际 Node 26 fetch 与真实 loopback HTTP server。服务器先发响应头和首块数据，再每 10ms 继续发送；仅 metadata/filesystem 使用项目既有内存夹具，网络不打桩。

最终 probe 的 fetch 包装只保留**原始 Response 观测引用**，仍调用原生 fetch、返回相同对象；避免“对象碰巧被回收”掩盖缺少显式取消。HTTP 404 和 HTTP 200/无 MIME 均得到预期业务拒绝，但在 storage 销毁后的 300ms 观测窗内，服务端 `close=false`，又发送了约 27–28 个块。正常完整响应的对照关闭且文件内容正确。

**2 failed / 1 passed**：[日志](evidence/2026-10-04/storage-fetch-retained-response.txt)、[状态](evidence/2026-10-04/storage-fetch-retained-response-status.json)。每例 finally 由测试调用方显式 abort 并关闭自己创建的服务器，之后不留后台请求。

初版不保留 Response 的一次运行中，404 在窗口末尾被收尾，得到 [1 failed / 2 passed](evidence/2026-10-04/storage-fetch-response-cleanup.txt)。该观察不证明服务主动取消了 404；最终 probe 的引用与资源归属边界均明示，不把两次不同测量面混成一个数字，也不宣称请求永远不会由运行时回收。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-storage:test --args='src/__tests__/review-fetch-response-cleanup.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

本轮不是 Chromium/真实桌面 IPC 的网络补证，不外推所有运行时；已确认标准 Response 路径上的主动释放遗漏及 Node 实际下载继续。

## 修复方案

响应体必须有明确所有者：获得 Response 后，响应头校验失败等未消费路径也进入统一收尾，显式取消未交给流式写入器的 body。保留原 `StorageFetchError` / `StorageMimeTypeMissingError`，不把 cleanup 异常变成成功或替换原业务分类。

正常流式消费不重复取消；补状态错误、MIME 缺失、读失败、用户 abort、慢响应和销毁的对照。不依赖运行时回收时机，不用固定执行超时隐藏资源遗漏。

## 解决记录

- [x] 真实 HTTP 失败复验与正常响应对照保留；业务实现未修改。
- [ ] 补响应头拒绝路径的响应体归属与取消。
- [ ] Chromium/桌面运行时同场景补证；当前仍 Open。
