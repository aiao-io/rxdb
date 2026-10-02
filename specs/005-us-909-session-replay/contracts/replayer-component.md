# Contract: 回放视图与三框架组件

**Research**: [../research.md](../research.md) D9、D10

## 1. core：`mountReplayer(host, options)`

```ts
interface ReplayerOptions {
  readonly replay: ReplayManager;
  readonly sessionId: string;
  readonly initialTime?: number; // 相对会话起点的 ms；默认 0
  readonly onTimeChange?: (timeMs: number) => void;
  readonly onCommitRestore?: (event: ReplayerCommitRestoreEvent) => void;
}

interface ReplayerCommitRestoreEvent {
  readonly marker: ReplayCommitMarker;
  readonly result: WorkingTreeRestoreResult | { readonly ok: false; readonly reason: 'error'; readonly error: Error };
}

interface ReplayerHandle {
  update(options: Partial<Pick<ReplayerOptions, 'replay' | 'sessionId' | 'initialTime'>>): void;
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  destroy(): void;
}

function mountReplayer(host: HTMLElement, options: ReplayerOptions): ReplayerHandle;
```

- `update()` 只在 `replay` 或 `sessionId` 变化时重新加载；只改 `initialTime` 等价于 `seek()`。
- `play` / `pause` / `seek` 在非就绪态是空操作（加载完成后按最后一次 `seek` 的时刻落位）。
- `destroy()` 幂等；之后的任何调用都是空操作。
- `restoreToCommit()` 抛错（如 `working_tree_unavailable`）时 `result` 为 `{ ok: false, reason: 'error', error }`，状态区显示错误消息。

## 2. DOM 契约（四态，测试按这些选择器断言）

| 元素        | 选择器 / 属性                                                                             |
| ----------- | ----------------------------------------------------------------------------------------- |
| 根          | `.rxdb-replayer[data-state=loading\|empty\|error\|ready]`；加载中 `aria-busy="true"`      |
| 错误        | `[role=alert]`，文本 = 错误消息                                                           |
| 空          | `.rxdb-replayer__empty`，文本 `No events to replay`                                       |
| 播放 / 暂停 | `button.rxdb-replayer__toggle`，`aria-pressed`，文本 `Play` / `Pause`                     |
| 时间轴      | `input[type=range][aria-label=Timeline]`，`min=0`、`max=总时长`、`aria-valuetext="mm:ss"` |
| commit 标记 | `ul[aria-label=Commits] > li > button`，`data-commit-id`，文本 `<id 前 8 位> · mm:ss`     |
| 恢复结果    | `[role=status][aria-live=polite]`                                                         |
| 回放根      | `.rxdb-replayer__stage`（rrweb `.replayer-wrapper` 挂在里面）                             |

只用原生可聚焦控件，键盘可达；颜色对比由内联样式里的 CSS 变量给出（`--rxdb-replayer-fg` 等），宿主可覆盖。

## 3. 三框架组件

| 项       | Angular `@aiao/rxdb-plugin-replay-angular`                           | React `@aiao/rxdb-plugin-replay-react` | Vue `@aiao/rxdb-plugin-replay-vue` |
| -------- | -------------------------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| 组件     | `ReplayerComponent`，选择器 `ao-replayer`                            | `Replayer`                             | `Replayer`                         |
| 输入     | `replay` / `sessionId`（`input.required`）、`initialTime`（`input`） | 同名 props                             | 同名 props                         |
| 时刻变化 | `aoTimeChange`（`output<number>`）                                   | `onTimeChange(timeMs)`                 | `time-change`（`emit`）            |
| 恢复结果 | `aoCommitRestore`（`output<ReplayerCommitRestoreEvent>`）            | `onCommitRestore(event)`               | `commit-restore`                   |
| 命令     | 组件实例方法 `play()` / `pause()` / `seek(ms)`                       | `ref` 句柄 `ReplayerRef` 的同名方法    | `defineExpose` 同名方法            |
| 宿主     | 组件宿主元素内一个 `div`                                             | 一个 `div`                             | 一个 `div`                         |
| 卸载     | `DestroyRef` → `destroy()`                                           | effect 清理 → `destroy()`              | `onBeforeUnmount` → `destroy()`    |

再导出：三个包都再导出 `ReplayerCommitRestoreEvent` 类型与 `replayRestoreHint`，不再导出其他 core 成员。

## 4. parity 契约（`@aiao/rxdb-plugin-replay/testing`）

`replayerParityCases` 是一组与框架无关的用例描述，三个包的组件测试各自把它翻译成本框架的挂载 / 改输入 / 调命令，`mountReplayer`
用 `vi.mock` 打桩：

1. 挂载 → `mountReplayer` 被调用一次，`host` 是组件内的元素，`replay` / `sessionId` / `initialTime` 原样传入；
2. 改 `sessionId` → `update({ sessionId })` 一次，不重新 `mountReplayer`；
3. 改 `initialTime` → `update({ initialTime })`；
4. 桩里触发 `onTimeChange(1234)` → 框架输出收到 `1234`；
5. 桩里触发 `onCommitRestore(e)` → 框架输出收到同一个 `e`；
6. 调 `play` / `pause` / `seek(500)` → 句柄同名方法各一次，`seek` 参数 `500`；
7. 卸载 → `destroy()` 一次。
