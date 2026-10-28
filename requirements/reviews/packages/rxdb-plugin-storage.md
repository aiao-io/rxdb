# rxdb-plugin-storage 深度评审

- 包：`@aiao/rxdb-plugin-storage`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟡凑合。新增确定问题见下文。

## 评审计划与实际范围

检查上传、远端拉取、覆盖与改名补偿、路径锁、流取消、对象 URL、销毁与元数据一致性；重点深入 `storage.ops`、`storage.rename-copy`、`PathLockManager` 与 `RxdbFileStorage`。

## 核查结果

- [`PathLockManager.withPaths`](../../../packages/rxdb-plugin-storage/src/path-lock.ts) 先去重排序锁键，独占操作等待已排队路径操作；有作用域时桥接 Web Locks。
- [`RxdbFileStorage.withCurrentPathLock`](../../../packages/rxdb-plugin-storage/src/storage.service.ts) 排队后重读元数据路径；改名导致锁保护对象漂移时重试且有次数上限。
- [`uploadLocked`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 默认拒绝覆盖，写失败与元数据失败均尝试恢复内容快照。
- [`rejectWithBodyCancelled`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 已覆盖 HTTP 非成功与 MIME 缺失时的响应体取消；本次问题发生在响应头通过之后。
- [`RxdbFileStorage.destroy`](../../../packages/rxdb-plugin-storage/src/storage.service.ts) 等待已登记写操作结算后清理对象 URL 与文件系统。

## 问题

### STORAGE-001 [P2] 写流初始化失败时，已收到的远端响应体没有取消

**证据**：[`streamReadableToFile`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 在 `try` 之前执行 `const writer = await host.filesystem.openWrite(opfsPath)`，随后才 `stream?.getReader()`。初始化失败会直接离开函数，完全绕过 catch 里的 `reader?.cancel(error)`。[`fetchToOpfs`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 的 finally 只删除临时文件，不取消响应体。

**触发**：服务端返回 200 和合法 Content-Type，正文仍在持续发送；创建本地临时文件或可写流因配额/权限/句柄错误而 reject。

**预期 / 实际**：fetch 应 reject 同时取消未消费的响应体；实际 fetch reject 后正文仍可继续下载，占用连接与带宽，重试会叠加未释放请求。

**实证**：将当前 `storage.ops.ts` 转译后直接调用真实 `streamReadableToFile`，仅以 `openWrite` 抛 `QuotaExceededError` 的宿主替身和带 cancel 计数器的 ReadableStream 入参诊断，结果为 `bodyCancelled:false, bodyLocked:false`。现有 [review-fetch-response-cleanup.spec.ts](../../../packages/rxdb-plugin-storage/src/__tests__/review-fetch-response-cleanup.spec.ts) 只覆盖 HTTP/MIME 提前拒绝，无法挡住这个分支。

**修复建议**：把 reader/writer 获取纳入同一资源获取与清理范围；拿不到 writer 时仍取消未消费的输入流，保留最初错误。

**回归建议**：持续发送正文的本地 HTTP 服务 + openWrite 故障，断言 fetch reject 原错且服务端 close 被触发；另覆盖 getReader 本身失败时已取得 writer 的释放。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 18 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-storage:test`：277 passed (277)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 本轮取消诊断用真实 ReadableStream 和源码函数，文件系统为故障替身；未声称验证真实 OPFS 配额耗尽、桌面 IPC 或断电补偿。
