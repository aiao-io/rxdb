# @aiao/rxdb-plugin-replay-angular

[`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay) 的 Angular 集成层。提供 `ao-replayer`（`ReplayerComponent`），把核心包的 `mountReplayer` 包成 signal 输入 / `output` 的独立组件。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay @aiao/rxdb-plugin-replay-angular @angular/core rxjs
```

## 用法

```typescript
import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  ReplayerComponent,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent
} from '@aiao/rxdb-plugin-replay-angular';
import { Component, input, signal } from '@angular/core';

@Component({
  selector: 'app-session-player',
  imports: [ReplayerComponent],
  template: `
    <ao-replayer
      #replayer
      [initialTime]="0"
      [replay]="replay()"
      [sessionId]="sessionId()"
      (aoCommitRestore)="onRestore($event)"
      (aoTimeChange)="time.set($event)"
    />
    <button (click)="replayer.play()" type="button">播放</button>
    <button (click)="replayer.pause()" type="button">暂停</button>
    <p>{{ time() }} ms</p>
    @if (hint(); as hint) {
      <p role="alert">{{ hint }}</p>
    }
  `
})
export class SessionPlayer {
  readonly replay = input.required<ReplayManager>();
  readonly sessionId = input.required<string>();
  readonly time = signal(0);
  readonly hint = signal<string | null>(null);

  onRestore({ result }: ReplayerCommitRestoreEvent): void {
    if (result.ok) this.hint.set(null);
    else this.hint.set(result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason));
  }
}
```

`replay` 传 `db.replay`。录制插件要先装进连接纪元（`db.use(rxDBPluginReplay, …)` 之后 `await db.connect()`），否则组件加载会话时拿到 `not_installed`。

| 成员                              | 说明                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `replay`（必填）                  | `ReplayManager`；换成别的门面会重新加载                                                                             |
| `sessionId`（必填）               | 要回放的会话                                                                                                        |
| `initialTime`                     | 加载完成后落到的时刻（相对会话起点的 ms，默认 0）；之后再改等价于 `seek()`                                          |
| `aoTimeChange`                    | 播放 / 拖动时间轴时发出当前时刻（ms）                                                                               |
| `aoCommitRestore`                 | 点 commit 标记恢复工作树后的结果，被拒绝时用 `replayRestoreHint(reason)` 取提示；`reason` 为 `'error'` 时看 `error` |
| `play()` / `pause()` / `seek(ms)` | 经模板引用调用；加载完成前调用是空操作（`seek` 会记下目标时刻）                                                     |

组件销毁时自动释放回放器。rrweb 回放端在组件首次加载会话时才按需 `import('rrweb')`。

三框架同功能对称：React 用 `Replayer`（[`@aiao/rxdb-plugin-replay-react`](../rxdb-plugin-replay-react)），Vue 用 `Replayer`（[`@aiao/rxdb-plugin-replay-vue`](../rxdb-plugin-replay-vue)）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 插件指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
