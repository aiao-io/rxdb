# rxdb-plugin-replay-react 深度评审

- 包：`@aiao/rxdb-plugin-replay-react`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。

## 评审计划与实际范围

比对本组三端实际 src/index.ts；检查 Replayer 的 mount effect / cleanup、useEffectEvent 最新回调、useImperativeHandle 命令，以及 replay/sessionId/initialTime 改变时 handle.update 的差分。该组件消费 replay prop，不把 RxDB Provider 换库当成本层独立能力。

## 核查结果

- [`Replayer`](../../../packages/rxdb-plugin-replay-react/src/replayer.tsx)：挂载 effect 建 handle 并在 cleanup 销毁，useEffectEvent 读取最新输入与事件回调；imperative ref 的 seek 在首个 effect 前可排队。
- `changedInputs` 只对 replay/sessionId/initialTime 真变化调用 update，事件回调不强迫播放器重建。
- 三端同一组输入、time-change/commit-restore 语义与 play/pause/seek 命令；共享 `replayRestoreHint` 和 `ReplayerCommitRestoreEvent` 都再导出。
- Angular output、React callback/ref、Vue emit/expose 的容器差异与其框架惯例相符，本次没有当作 API 缺失。

- handle.update 只替换播放器观察的输入；组件 cleanup 调用 handle.destroy，未对调用方提供的 replay 门面调用 destroy。两类资源的所有权没有混用。

## 问题

本次未发现可给出确定触发链的新增包内问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 3 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-replay-react:test`：15 passed (15)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已检查包装层生命周期与输入差分；rrweb资源释放和恢复并发的实际实现归属 replay 核心包。未在三框架真实应用中重新跑视觉和无障碍对拍。
