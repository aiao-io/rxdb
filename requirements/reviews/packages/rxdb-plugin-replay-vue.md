# rxdb-plugin-replay-vue 深度评审

- 包：`@aiao/rxdb-plugin-replay-vue`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。
- 2026-10-29 复核：源码自基线起无变更（git diff 7bb16a9..HEAD 本包为空）；抽查关键符号与报告链接均有效，结论与计数不变。

## 评审计划与实际范围

比对本组三端实际 src/index.ts；检查 Replayer 的 mounted/unmount、toRaw(replay)、watch 输入差分与 expose 的 play/pause/seek。组件句柄只由本组件释放，不把调用方传入的 replay 门面当作组件拥有资源销毁。

## 核查结果

- [`Replayer`](../../../packages/rxdb-plugin-replay-vue/src/replayer.ts)：onMounted 建 handle、onBeforeUnmount 清理；replay 先 toRaw，避免给带私有字段的门面套代理，seek 可在挂载前排队。
- `changedInputs` 只对 replay/sessionId/initialTime 真变化调用 update，事件回调不强迫播放器重建。
- 三端同一组输入、time-change/commit-restore 语义与 play/pause/seek 命令；共享 `replayRestoreHint` 和 `ReplayerCommitRestoreEvent` 都再导出。
- Angular output、React callback/ref、Vue emit/expose 的容器差异与其框架惯例相符，本次没有当作 API 缺失。

- handle.update 只替换播放器观察的输入；组件 cleanup 调用 handle.destroy，未对调用方提供的 replay 门面调用 destroy。两类资源的所有权没有混用。

## 问题

本次未发现可给出确定触发链的新增包内问题。

**2026-10-29 复核：**本包源码自基线起无变更；抽查关键符号与链接仍有效，结论不变，本更新轮未发现新的确定问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 2 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-replay-vue:test`：11 passed (11)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已检查包装层生命周期与输入差分；rrweb资源释放和恢复并发的实际实现归属 replay 核心包。未在三框架真实应用中重新跑视觉和无障碍对拍。
