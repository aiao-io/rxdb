# rxdb-plugin-replay-angular 深度评审

- 包：`@aiao/rxdb-plugin-replay-angular`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。
- 2026-10-29 复核：源码自基线起无变更（git diff 7bb16a9..HEAD 本包为空）；抽查关键符号与报告链接均有效，结论与计数不变。

## 评审计划与实际范围

比对本组三端实际 src/index.ts；沿 ReplayerComponent 的 afterNextRender、输入逐字段差分、挂载前 seek 排队与 DestroyRef 释放检查句柄所有权。播放器核心的网络/会话异步代次另在 replay 包核查。

## 核查结果

- [`ReplayerComponent`](../../../packages/rxdb-plugin-replay-angular/src/replayer.component.ts)：afterNextRender 后创建 handle，DestroyRef 释放；effect 对已应用输入逐字段求差，挂载前 seek 保留到 handle 可用。
- `changedInputs` 只对 replay/sessionId/initialTime 真变化调用 update，事件回调不强迫播放器重建。
- 三端同一组输入、time-change/commit-restore 语义与 play/pause/seek 命令；共享 `replayRestoreHint` 和 `ReplayerCommitRestoreEvent` 都再导出。
- Angular output、React callback/ref、Vue emit/expose 的容器差异与其框架惯例相符，本次没有当作 API 缺失。

- handle.update 只替换播放器观察的输入；组件 cleanup 调用 handle.destroy，未对调用方提供的 replay 门面调用 destroy。两类资源的所有权没有混用。

## 问题

本次未发现可给出确定触发链的新增包内问题。

**2026-10-29 复核：**本包源码自基线起无变更；抽查关键符号与链接仍有效，结论不变，本更新轮未发现新的确定问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 4 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-replay-angular:test`：32 passed (32)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已检查包装层生命周期与输入差分；rrweb资源释放和恢复并发的实际实现归属 replay 核心包。未在三框架真实应用中重新跑视觉和无障碍对拍。
