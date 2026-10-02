# @aiao/rxdb-plugin-replay-react

[`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay) 的 React 集成层。提供 `Replayer` 组件，把核心包的 `mountReplayer` 包成 props 与 `ref` 句柄。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay @aiao/rxdb-plugin-replay-react react rxjs
```

## 用法

```tsx
import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  Replayer,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent,
  type ReplayerRef
} from '@aiao/rxdb-plugin-replay-react';
import { useRef, useState } from 'react';

const restoreMessage = ({ result }: ReplayerCommitRestoreEvent): string | null => {
  if (result.ok) return null;
  return result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason);
};

export function SessionPlayer({ replay, sessionId }: { readonly replay: ReplayManager; readonly sessionId: string }) {
  const replayer = useRef<ReplayerRef>(null);
  const [time, setTime] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  return (
    <section>
      <Replayer
        ref={replayer}
        replay={replay}
        sessionId={sessionId}
        initialTime={0}
        onTimeChange={setTime}
        onCommitRestore={event => setHint(restoreMessage(event))}
      />
      <button onClick={() => replayer.current?.play()} type="button">
        播放
      </button>
      <button onClick={() => replayer.current?.pause()} type="button">
        暂停
      </button>
      <p>{time} ms</p>
      {hint && <p role="alert">{hint}</p>}
    </section>
  );
}
```

`replay` 传 `db.replay`。录制插件要先装进连接纪元（`db.use(rxDBPluginReplay, …)` 之后 `await db.connect()`），否则组件加载会话时拿到 `not_installed`。

| 成员                              | 说明                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `replay`（必填）                  | `ReplayManager`；换成别的门面会重新加载                                                                             |
| `sessionId`（必填）               | 要回放的会话                                                                                                        |
| `initialTime`                     | 加载完成后落到的时刻（相对会话起点的 ms，默认 0）；之后再改等价于 `seek()`                                          |
| `onTimeChange`                    | 播放 / 拖动时间轴时收到当前时刻（ms）                                                                               |
| `onCommitRestore`                 | 点 commit 标记恢复工作树后的结果，被拒绝时用 `replayRestoreHint(reason)` 取提示；`reason` 为 `'error'` 时看 `error` |
| `play()` / `pause()` / `seek(ms)` | 经 `ref`（`ReplayerRef`）调用；加载完成前调用是空操作（`seek` 会记下目标时刻）                                      |

组件卸载时自动释放回放器。rrweb 回放端在组件首次加载会话时才按需 `import('rrweb')`。

三框架同功能对称：Angular 用 `ao-replayer`（[`@aiao/rxdb-plugin-replay-angular`](../rxdb-plugin-replay-angular)），Vue 用 `Replayer`（[`@aiao/rxdb-plugin-replay-vue`](../rxdb-plugin-replay-vue)）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 插件指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
