# @aiao/rxdb-plugin-replay-vue

[`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay) 的 Vue 集成层。提供 `Replayer` 组件，把核心包的 `mountReplayer` 包成 props / emits / `expose` 命令。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay @aiao/rxdb-plugin-replay-vue vue rxjs
```

## 用法

```vue
<script lang="ts" setup>
import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  Replayer,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent,
  type ReplayerRef
} from '@aiao/rxdb-plugin-replay-vue';
import { ref, useTemplateRef } from 'vue';

defineProps<{ replay: ReplayManager; sessionId: string }>();

const replayer = useTemplateRef<ReplayerRef>('replayer');
const time = ref(0);
const hint = ref<string | null>(null);

function onRestore({ result }: ReplayerCommitRestoreEvent): void {
  if (result.ok) hint.value = null;
  else hint.value = result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason);
}
</script>

<template>
  <Replayer
    :initial-time="0"
    :replay="replay"
    :session-id="sessionId"
    @commit-restore="onRestore"
    @time-change="time = $event"
    ref="replayer"
  />
  <button @click="replayer?.play()" type="button">播放</button>
  <button @click="replayer?.pause()" type="button">暂停</button>
  <p>{{ time }} ms</p>
  <p v-if="hint" role="alert">{{ hint }}</p>
</template>
```

`replay` 传 `db.replay`。录制插件要先装进连接纪元（`db.use(rxDBPluginReplay, …)` 之后 `await db.connect()`），否则组件加载会话时拿到 `not_installed`。

| 成员                              | 说明                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `replay`（必填）                  | `ReplayManager`；换成别的门面会重新加载                                                                             |
| `sessionId`（必填）               | 要回放的会话                                                                                                        |
| `initialTime`                     | 加载完成后落到的时刻（相对会话起点的 ms，默认 0）；之后再改等价于 `seek()`                                          |
| `time-change`                     | 播放 / 拖动时间轴时发出当前时刻（ms）                                                                               |
| `commit-restore`                  | 点 commit 标记恢复工作树后的结果，被拒绝时用 `replayRestoreHint(reason)` 取提示；`reason` 为 `'error'` 时看 `error` |
| `play()` / `pause()` / `seek(ms)` | 经模板 `ref`（`ReplayerRef`）调用；加载完成前调用是空操作（`seek` 会记下目标时刻）                                  |

组件卸载时自动释放回放器。rrweb 回放端在组件首次加载会话时才按需 `import('rrweb')`。

三框架同功能对称：Angular 用 `ao-replayer`（[`@aiao/rxdb-plugin-replay-angular`](../rxdb-plugin-replay-angular)），React 用 `Replayer`（[`@aiao/rxdb-plugin-replay-react`](../rxdb-plugin-replay-react)）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 插件指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
