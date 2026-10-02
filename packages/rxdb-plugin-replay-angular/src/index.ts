/**
 * rxdb-plugin-replay-angular - Angular 会话回放组件
 *
 * 提供 `ao-replayer`（{@link ReplayerComponent}），把 `@aiao/rxdb-plugin-replay` 的 `mountReplayer` 包成 signal 输入 / `output` 的组件。
 * 与 React / Vue 的 `Replayer` 同一组输入 / 输出 / 命令（contracts/replayer-component.md §3）。
 *
 * @packageDocumentation
 */

// 只再导出组件事件类型与恢复提示文案，其余 core 成员从 `@aiao/rxdb-plugin-replay`（peer）直接 import
export { replayRestoreHint, type ReplayerCommitRestoreEvent } from '@aiao/rxdb-plugin-replay';
export { ReplayerComponent } from './replayer.component.js';
