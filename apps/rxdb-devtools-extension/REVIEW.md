# `rxdb-devtools-extension` 代码评审

## 结论

🔴 不通过。清库、上传失败清理、连接状态和上传大小边界已修复；整库下载仍会全量读取同源 OPFS，是剩余阻断项。

## 修复状态（2026-07-15）

- DEVTOOLS-001、DEVTOOLS-003、DEVTOOLS-004、DEVTOOLS-005 已修复并补测试。
- DEVTOOLS-002 未修复：下载仍需限定目录、总量预算、流式输出与取消。
- `test` 150 个用例通过，`lint`、`typecheck`、`build` 全部通过。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/rxdb-devtools-extension` 下 devtools/background/content 通信、数据库与 OPFS 操作、UI、测试和 Vite/Nx 配置
- 自动校验：本轮仅完成只读代码审查，未为该项目单独运行 `lint`、`typecheck`、`build` 或自动测试
- 测试现状：已有清库、归档和端口单测，但未覆盖 IndexedDB blocked、超大 OPFS、跨状态断连、上传写入失败与大文件硬限制

## 问题

| ID           | 级别 | 位置                                          | 问题与影响                                                                                                                                                                                                                                | 建议                                                                                                                                                                                    |
| ------------ | ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEVTOOLS-001 | P1   | `src/devtools/scripts/clear-database.ts:183`  | IndexedDB 删除请求的 `onblocked` 直接 `resolve()`，随后整段逻辑把 `results.indexedDB.success` 设为 true。数据库其实仍存在，设置页却会报告清理成功；后续测试和用户操作都可能继续使用旧数据。                                               | `onblocked` 必须是未完成/失败状态，提示关闭持有连接的页面，并在有界超时后返回明确错误；只有每个 `onsuccess` 都触发后才能标记成功。增加 blocked 后数据库仍存在的回归测试。               |
| DEVTOOLS-002 | P1   | `src/devtools/scripts/download-database.ts:8` | “下载数据库”递归枚举整个同源 OPFS，把每个文件 `arrayBuffer()` 全量读入 `files`，再复制进 `tarParts`、聚合 `tarData` 和 `Blob`。范围未限定到 RxDB，内存峰值是数据量的多倍；大库会冻结或崩溃，还可能顺带导出同源其他应用数据。              | 明确选择并限制数据库目录，先计算总量并设置硬预算；使用流式 tar/分块写出和取消信号，禁止保留全量文件及归档的多份副本。增加多文件、大文件、取消和非目标目录测试。                         |
| DEVTOOLS-003 | P2   | `src/devtools/services/port.service.ts:74`    | background port 断开时只复位 `PortService.connected`。Header 使用的是独立的 `DevToolsStateService.connected`，后者只有收到页面 `DISCONNECT` 消息才复位；Service Worker 崩溃或 port 被系统回收时，UI 仍可能显示“已连接”并保留旧事件/分支。 | 从 PortService 暴露统一的连接生命周期事件；底层 port 断开必须驱动 DevToolsState 原子 reset，重连后仍需等待新的页面 handshake 才能显示已连接。补充“无 DISCONNECT 消息的 port 断开”测试。 |
| DEVTOOLS-004 | P2   | `src/content/opfs.ts:187`                     | 上传创建 writable 后，`write()` 或 `close()` 失败只落入外层 catch，没有调用 `abort()`。文件可能保持锁定或留下半写内容，后续重试与数据库读取都会面对不确定状态。                                                                           | 用局部 `try/catch` 管理 writable；任何写入/关闭失败都尽力 `abort()`，并保留原始异常。增加 write 失败、close 失败和 abort 失败测试。                                                     |
| DEVTOOLS-005 | P2   | `src/devtools/services/opfs.service.ts:141`   | 文件超过 50 MiB 只弹 warning，随后仍整文件 `arrayBuffer`、转 base64 并通过扩展消息传输。编码还会额外膨胀约三分之一，足以阻塞面板或撞上消息/内存限制。                                                                                     | 50 MiB 应是硬拒绝或切换到分块协议的阈值；在读取文件前终止，不得先分配 ArrayBuffer。分块方案需要进度、取消、校验和与失败清理。                                                           |

## 其余观察与测试缺口

- 消息格式有运行时校验，事件列表也有上限；连接状态却维护了两份，边界事件没有统一。
- 清库已处理部分 OPFS 临时锁并有重试，这是正确方向；IndexedDB blocked 不能借“继续流程”伪装成成功。
- 现有 tar 测试集中在小文件格式正确性，无法发现全量内存算法的生产风险。

## 验收条件

- IndexedDB blocked、error、success 三种结果可区分；任何未删除数据库都不得显示“全部清理成功”。
- 导出只包含用户确认的 RxDB 数据，具备总量上限、流式处理、取消和超大数据回归测试。
- background port 无预告断开时 UI 立即 reset，重连后必须重新 handshake 才恢复 connected。
- 上传失败必定关闭或 abort writable；超阈值文件在读取和 base64 编码前被拒绝，或走经过测试的分块协议。
- 修复后执行 `pnpm nx lint rxdb-devtools-extension`、`pnpm nx typecheck rxdb-devtools-extension`、`pnpm nx build rxdb-devtools-extension` 及覆盖上述失败分支的自动测试。
