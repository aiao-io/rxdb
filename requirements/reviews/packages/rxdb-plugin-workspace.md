# rxdb-plugin-workspace 深度评审

- 包：`@aiao/rxdb-plugin-workspace`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟡凑合。新增确定问题见下文。

## 评审计划与实际范围

完整追踪草稿新建/删除、恢复窗口、跨标签页消息校验、flush屏障、错误重排队、连接纪元与表集换挂分区；结合现有换挂测试检查真正的持久化键身份。

## 核查结果

- [`decodeWorkspaceEntry`](../../../packages/rxdb-plugin-workspace/src/workspace-entry.ts) 统一验证草稿键、UUID 与 data.id，自存储恢复和跨标签页 add 共用解码。
- [`RxDBPluginWorkspace.#loadView`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts) 用 store 身份及 view_generation 拒绝旧恢复回写，恢复时记录删除意图。
- 同一类 `#runTask` 对坏记录做 structuredClone 预检，其余记录可继续写；错误向 flushWaiters 传播，未把坏草稿静默记成功。
- `#queued_keys` 试图保存旧分区身份，但与两个待写集合一样只按 cacheId 键控，无法同时表示同一实体两个分区尚未结算的写，见 WORKSPACE-001。

- [`RxDBPluginWorkspace.#entityEventHandler`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts) 在 restoring 期间仍接收当前表集的合法 NEW；ready 是等待接口，没有禁止此期间新建的写入屏障，因此 WORKSPACE-001 的窗口未被隐藏前置条件排除。

## 问题

### WORKSPACE-001 [P2] 换挂恢复窗口内同 UUID 的新草稿覆盖旧分区待写草稿

**证据**：[`RxDBPluginWorkspace.#remount`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts) 清掉当前视图后发起 `#loadView(true)`，旧队列异步经 `#settleQueue` 结算。期间 `#entityEventHandler` 仍接受新表集 NEW，`#queueSave` 把两份不同分区草稿写入按无分区 cacheId 键控的 `#need_save_entities`、`#queued_keys`。第二份会覆盖第一份尚未落盘的内容和目标键。

**触发**：`autoSave:false` 下主表集新建 UUID=X 的草稿但不 flush；切换到 wt_a 后、`workspace.ready` 完成前，在 wt_a 新建或跨标签页接收同 UUID=X 的草稿。缓存主键公开不含 partition，因此两者都是同一个 `namespace:entity:X`。

**预期 / 实际**：主表集待写草稿应落到主键，wt_a 草稿落到带 wt_a 前缀的键，各自保留。实际最终只存在 wt_a 键，主草稿从内存清除且从未落盘；挂回主表集找不回来。

**实证**：本轮将当前 Workspace 类和 workspace-entry 源码转译，使用真实 RxJS Subject/BehaviorSubject、内存 IndexedDB 替身与表集可见性替身；按“main NEW → 表集 next(wt_a) → ready前 wt_a同ID NEW → await ready/flush”执行，结果 `mainDraftPersisted:false`，持久化条目只有 `wt_a:public:Todo:X`，内容为 shadow-draft。只替换了宿主与存储，未重写队列逻辑。

**现有覆盖缺口**：[RxDBPluginWorkspace.spec.ts](../../../packages/rxdb-plugin-workspace/src/__tests__/RxDBPluginWorkspace.spec.ts) 的“换挂：旧视图排队的写先落盘”用例先 await ready，再操作新视图，且主/影子 UUID 不同，挡不住此窗口。

**修复建议**：待写队列和对应目标键以完整持久化键（partition+cacheId）建模，或让切换前后的独立队列各自结算；当前视图仍可对外只暴露无分区 cacheId。

**回归建议**：两个分区同 UUID、换挂ready未完成的新建/广播、旧分区删除与新分区新增交错；断言两个物理键及挂回主表集后的恢复值。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 5 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-workspace:test`：112 passed (112)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 本轮已复现换挂队列状态机，使用内存IndexedDB及表集替身；未模拟真实浏览器标签页调度和文件系统。现有浏览器换挂测试通过也不能证明上述未覆盖窗口安全。
