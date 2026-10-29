# rxdb-plugin-storage 深度评审

- 包：`@aiao/rxdb-plugin-storage`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟡凑合。发现 1 条 P1、1 条 P2：目录复制重命名在源目录部分删除失败后丢文件；写流初始化失败漏取消响应体。2026-10-29 更新轮复核均仍有效、无新增。

## 评审计划与实际范围

检查上传、远端拉取、覆盖与改名补偿、路径锁、流取消、对象 URL、销毁与元数据一致性；重点深入 `storage.ops`、`storage.rename-copy`、`PathLockManager` 与 `RxdbFileStorage`。

## 核查结果

- [`PathLockManager.withPaths`](../../../packages/rxdb-plugin-storage/src/path-lock.ts) 先去重排序锁键，独占操作等待已排队路径操作；有作用域时桥接 Web Locks。
- [`RxdbFileStorage.withCurrentPathLock`](../../../packages/rxdb-plugin-storage/src/storage.service.ts) 排队后重读元数据路径；改名导致锁保护对象漂移时重试且有次数上限。
- [`uploadLocked`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 默认拒绝覆盖，写失败与元数据失败均尝试恢复内容快照。
- [`rejectWithBodyCancelled`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 已覆盖 HTTP 非成功与 MIME 缺失时的响应体取消；本次问题发生在响应头通过之后。
- [`RxdbFileStorage.destroy`](../../../packages/rxdb-plugin-storage/src/storage.service.ts) 等待已登记写操作结算后清理对象 URL 与文件系统。

- [`StorageFileWriter.abort`](../../../packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts) 明确不得抛出，OPFS 实现也吞掉清理错误；本次未在自定义 writer 违反此合同的假设上另报“abort 覆盖原错”。目录递归删除没有同等失败原子性合同，STORAGE-002 单独按该边界判断。

## 问题

### STORAGE-001 [P2] 写流初始化失败时，已收到的远端响应体没有取消

**证据**：[`streamReadableToFile`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 在 `try` 之前执行 `const writer = await host.filesystem.openWrite(opfsPath)`，随后才 `stream?.getReader()`。初始化失败会直接离开函数，完全绕过 catch 里的 `reader?.cancel(error)`。[`fetchToOpfs`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 的 finally 只删除临时文件，不取消响应体。

**触发**：服务端返回 200 和合法 Content-Type，正文仍在持续发送；创建本地临时文件或可写流因配额/权限/句柄错误而 reject。

**预期 / 实际**：fetch 应 reject 同时取消未消费的响应体；实际 fetch reject 后正文仍可继续下载，占用连接与带宽，重试会叠加未释放请求。

**实证**：将当前 `storage.ops.ts` 转译后直接调用真实 `streamReadableToFile`，仅以 `openWrite` 抛 `QuotaExceededError` 的宿主替身和带 cancel 计数器的 ReadableStream 入参诊断，结果为 `bodyCancelled:false, bodyLocked:false`。现有 [review-fetch-response-cleanup.spec.ts](../../../packages/rxdb-plugin-storage/src/__tests__/review-fetch-response-cleanup.spec.ts) 只覆盖 HTTP/MIME 提前拒绝，无法挡住这个分支。

**修复建议**：把 reader/writer 获取纳入同一资源获取与清理范围；拿不到 writer 时仍取消未消费的输入流，保留最初错误。

**回归建议**：持续发送正文的本地 HTTP 服务 + openWrite 故障，断言 fetch reject 原错且服务端 close 被触发；另覆盖 getReader 本身失败时已取得 writer 的释放。

**2026-10-29 复核：**仍有效。基线 `7bb16a9` → `f62f77c19d55c73d8335df026778422282c2fed4` 区间本包无源码变更；[`streamReadableToFile`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 的 `openWrite` 仍在 `try` 之前，[`fetchToOpfs`](../../../packages/rxdb-plugin-storage/src/storage.ops.ts) 的 finally 仍只删临时文件。

### STORAGE-002 [P1] 目录复制重命名在源目录部分删除失败后丢掉唯一完整副本

**证据**：[`renameDirectoryLocked`](../../../packages/rxdb-plugin-storage/src/storage.rename-copy.ts) 在不支持原生目录移动时，先复制 source 到 target、更新元数据，最后 `await host.removeDirectoryPath(sourcePath)`。该递归删除若已经删掉一部分源文件再失败，catch 执行 `rollbackDirectoryCopy(host, copyJournal)` 和 `removeDirectoryPath(targetPath)`，会删除完整目标副本，却没有先用目标恢复被部分删除的源目录。

[`StorageFilesystem.removeDirectory`](../../../packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts) 只承诺递归删除与不存在时幂等，没有失败原子性保证。调用层不能把“递归删除失败”推断为“源树完全没动”。[`RxdbFileStorage.renameDirectory`](../../../packages/rxdb-plugin-storage/src/storage.service.ts) 的独占锁解决并发写，不会把文件系统的部分失败变成事务回滚。

**触发**：正常目录 /source 有已登记的 a.txt 和 b.txt；OPFS 未提供目录 move，或自定义文件系统返回不支持目录原生 move；调用 renameDirectory('/source', 'target')。复制和元数据更新完成后，递归删除源目录先成功删 a.txt，再因后续文件/目录失败而 reject。

**预期 / 实际**：重命名失败应保留 a.txt 的至少一份完整可恢复副本，再决定回滚布局。实际补偿把 target/a.txt 删除，source/a.txt 也已经被删，字节永久丢失；元数据回滚回 source/a.txt，留下“元数据在、文件不在”。

**实证**：内存转译当前真实 `renameDirectoryLocked`、copy 与 rollback 函数，宿主接缝包含两份文件和两条元数据；仅在删除 /source 时先删除 a.txt 再抛出故障。输出为：

```text
rename failed: recursive removal interrupted after a.txt
files after rollback: [["source/b.txt","B"]]
metadata after rollback: [{"id":"a","name":"a.txt","opfsPath":"source/a.txt"},{"id":"b","name":"b.txt","opfsPath":"source/b.txt"}]
```

这是对接口允许的部分失败做确定性注入；没有声称本次已在真实 OPFS 或桌面宿主制造同一失败。内置 Electron/Tauri 后端通常走原生目录 move，本条不泛化到那个分支。故障发生在旧目录清理阶段，正常重命名与“抛错前源目录一个字节都没动”的测试无法覆盖。

**修复建议**：把复制后的完整目标当作源目录清理阶段的恢复依据；源删除失败时先恢复/保留源内容并确认恢复成功，再清理目标。恢复也失败时保留完整副本和可定位的错误，不能继续无条件删除唯一完整副本。原生 move 与复制补偿各自明确提交点。

**回归建议**：源目录递归删除分别在第一个文件之后、中间子目录、最后移除目录时失败，断言原始每个文件至少保留一份，元数据可定位；再覆盖恢复失败时完整副本不被清掉、覆盖目标时旧目标备份仍可恢复。

**2026-10-29 复核：**仍有效。基线区间本包无源码变更；[`renameDirectoryLocked`](../../../packages/rxdb-plugin-storage/src/storage.rename-copy.ts) 仍在复制与元数据更新后执行 `removeDirectoryPath(sourcePath)`，catch 仍无条件 `removeDirectoryPath(targetPath)`；[`StorageFilesystem.removeDirectory`](../../../packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts) 仍无失败原子性承诺。本更新轮未发现新的确定问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 18 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-storage:test`：277 passed (277)；目标实际执行。命令及整体边界见[总索引](README.md)。
- STORAGE-002 另以真实目录重命名/补偿函数和部分递归删除故障接缝复现；未注入真实宿主故障。取消诊断用真实 ReadableStream 和源码函数，文件系统为故障替身；未声称验证真实 OPFS 配额耗尽、桌面 IPC 或断电补偿。
