# rxdb-plugin-replay 深度评审

- 包：`@aiao/rxdb-plugin-replay`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。
- 2026-10-29 复核：源码自基线起无变更（git diff 7bb16a9..HEAD 本包为空）；抽查关键符号与报告链接均有效，结论与计数不变。

## 评审计划与实际范围

检查录制启动/停止重入、事件缓冲、刷盘事务、体积上限、刷新暂存认领、连接纪元释放、恢复提交与播放器异步加载代次。

## 核查结果

- [`ReplayRuntime.start`](../../../packages/rxdb-plugin-replay/src/manager.ts) 串起 resuming 与 starting；`stop` 共享正在进行的停止 Promise，release 等停止后销毁独立录制库。
- [`ReplayRecorder.#flush`](../../../packages/rxdb-plugin-replay/src/recorder.ts) 单一在飞批次，stop 先停录制再排空缓冲；失败和截断停止后续事件接收。
- [`ReplayStore.appendBatch`](../../../packages/rxdb-plugin-replay/src/store.ts) 在同一事务写事件行与会话计数/nextSeq；删除会话也在一个事务删关联事件。
- [`claimReplayStash`](../../../packages/rxdb-plugin-replay/src/resume.ts) 先删除暂存键再解码，非法形状交出明确失败；`unwrittenStashEvents` 按已落库 seq 去重。
- [`ReplayerView.#load`](../../../packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts) 通过 generation 丢弃切换会话/销毁后的迟到结果；恢复后的 UI 回写也验证 generation。
- [`restoreToCommit`](../../../packages/rxdb-plugin-replay/src/restore.ts) 每次读取当前工作树凭据后执行恢复，不复用录制时的旧 HEAD。

- [`ReplayStore.#transaction` / `readEvents` / `totalBytes`](../../../packages/rxdb-plugin-replay/src/store.ts) 使用适配器事务仓储；它不经过核心 Repository 门面的默认分页，因此没有把缺少显式 limit 误报成“只读取 100 条事件”。读写会话与计数继续由同一个执行器串起。

## 问题

本次未发现可给出确定触发链的新增包内问题。

**2026-10-29 复核：**本包源码自基线起无变更；抽查关键符号与链接仍有效，结论不变，本更新轮未发现新的确定问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 18 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-replay:test`：149 passed | 1 skipped (150)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 未逐 rrweb DOM 事件种类验证脱敏结果，未模拟浏览器崩溃、sessionStorage 配额及真实 BFCache。录制库依赖调用方工厂的隔离配置，源码检查不能替代部署级验证。
