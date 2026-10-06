# @aiao/rxdb-plugin-replay

`@aiao/rxdb-plugin-replay` 给 `@aiao/rxdb` 加上**会话录制与回放**。它用 [rrweb](https://github.com/rrweb-io/rrweb) 录下页面 DOM 的变化，把事件写进一个**独立的录制库**；回放时，时间轴上会标出工作树的每次提交，点一下标记就能把工作树恢复到那次提交。

用途是复现问题：用户操作出错时，把那段录像连同当时的数据状态一起拿回来。

## 核心特性

- **默认不录**：插件装上后什么也不做，应用显式调用 `start()` 才开始
- **独立录制库**：事件写进你通过工厂提供的另一个 RxDB，被录的应用库里不多一行；工作树、同步看不见录像
- **刷新续录**：页面刷新后续上同一个会话，未冲刷的事件不丢
- **体积上限**：单会话与总量各有上限，可配置；插件从不自动删除录像
- **默认脱敏**：输入框只录成同长度的 `*`，标了 `data-rxdb-replay-block` 的区块只录占位
- **commit 标记**：装了 `@aiao/rxdb-plugin-working-tree` 时，录制中的每次提交都会落一条标记，回放时可一键恢复
- **三框架回放组件**：Angular `ao-replayer` / React `Replayer` / Vue `Replayer`，输入、事件、命令一一对应

rrweb 钉在精确版本 `2.1.7`。录制端随插件加载；回放端在第一次打开回放视图时才按需 `import('rrweb')`。

## 安装

```bash npm2yarn
npm install @aiao/rxdb-plugin-replay
# 需要 commit 标记与恢复时（可选 peer）
npm install @aiao/rxdb-plugin-working-tree
# 回放组件（按需选其一）
npm install @aiao/rxdb-plugin-replay-angular
npm install @aiao/rxdb-plugin-replay-react
npm install @aiao/rxdb-plugin-replay-vue
```

## 注册插件

插件只有一个必填选项：录制库工厂 `createRecordingDb`。它收到录制实体，返回**另一个 RxDB**（是否已 `init()` 都可以）。不要返回被录的应用库。

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginReplay } from '@aiao/rxdb-plugin-replay';

db.use(rxDBPluginReplay, {
  createRecordingDb: entities =>
    new RxDB({
      dbName: 'my-app-replay',
      entities: [...entities],
      multiInstance: false,
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    }).adapter('sqlite-wasm', async recordingDb => new RxDBAdapterSqlite(recordingDb, sqliteOptions)),
  limits: { sessionBytes: 16 * 1024 * 1024, storeBytes: 128 * 1024 * 1024 },
  flush: { intervalMs: 1000, maxEvents: 200 },
  record: { maskTextSelector: '.secret' }
});
await db.connect('sqlite-wasm');
```

插件声明 `inject: ['adapter:local']`，宿主在本地适配器就绪后才把它装进连接纪元。在 `connect()` 之后才 `use()` 也可以，但安装是异步的：此时再 `await db.connect(...)` 一次（连接会去重，重复调用会等插件装好）再使用 `db.replay`。装好之前，除 `state$` 外的成员都会拒绝 `not_installed`。

工厂每个连接纪元只调用一次，时机是第一次需要存储时。插件替它 `connect()`（尚未 `init()` 的库由 `connect()` 一并 `init()`），作用域释放时 `destroy()`。工厂抛错或返回的库连不上时，插件抛 `recording_db_unavailable`，下次调用会再调用工厂。

| 选项                  | 默认    | 说明                                 |
| --------------------- | ------- | ------------------------------------ |
| `createRecordingDb`   | 必填    | 录制库工厂                           |
| `limits.sessionBytes` | 16 MiB  | 单会话上限                           |
| `limits.storeBytes`   | 128 MiB | 录制库总量上限                       |
| `flush.intervalMs`    | 1000    | 事件缓冲的冲刷间隔                   |
| `flush.maxEvents`     | 200     | 缓冲达到这么多条就提前冲刷           |
| `record`              | —       | rrweb 录制选项的子集，见下文「脱敏」 |

## 录制与读取

```typescript
const sessionId = await db.replay.start();
// …用户操作…
await db.replay.stop();

db.replay.state$.subscribe(state => console.log(state.kind)); // idle / recording / truncated / error

const sessions = await db.replay.listSessions(); // startedAt 倒序：状态、事件数、体积
const events = await db.replay.readEvents(sessionId); // 可传 { from, to } 只读一段
const archive = await db.replay.exportSession(sessionId); // 可 JSON.stringify 存档
const { bytes, sessionCount, limits } = await db.replay.usage();
await db.replay.deleteSession(sessionId); // 释放空间的唯一途径
```

同一时刻只能录一个会话，第二次 `start()` 抛 `already_recording`。没有 DOM 的环境（Node、Worker）抛 `no_dom`。

### 刷新续录

录制中的会话会把状态暂存在 `sessionStorage`。页面刷新后插件重新安装时认领暂存，继续写同一个会话 id，还没冲刷的事件一并补上。暂存不完整时写一条 `gap` 标记，说明这里可能缺了事件。

## 体积上限

体积按事件 `JSON.stringify` 后的 UTF-8 字节计。

- **单会话超限**：该会话停止录制，写一条 `truncated` 标记，会话状态变为 `truncated`（`truncatedCode: 'session_limit'`）。
- **总量超限**：`start()` 抛 `store_limit`，不开新会话。

插件**从不自动删除**旧录像。要腾空间，调用 `deleteSession()`。

## 脱敏

- `maskAllInputs` 默认为 `true`：输入框的值只录成同样长度的 `*`。
- 给元素加上 `data-rxdb-replay-block` 属性（常量 `REPLAY_BLOCK_SELECTOR`），它在录像里只剩一个同尺寸的占位块，内部文字不进录像。这个选择器总会并入你传的 `record.blockSelector`。
- `record` 还透传 rrweb 的 `maskInputOptions`、`maskTextSelector`、`maskTextClass`、`blockSelector`、`blockClass`、`ignoreSelector`，含义以 rrweb 文档为准。

```html
<input type="password" />
<!-- 录成 ******** -->
<div data-rxdb-replay-block>身份证号：…</div>
<!-- 录成同尺寸占位 -->
```

## commit 标记与恢复

被录的库装了 [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md) 时，插件订阅工作树门面的 `commits$`。录制中每次提交都会写一条 commit 标记（rrweb Custom 事件，`tag` 为 `rxdb-replay:commit`）。

```typescript
import { replayRestoreHint } from '@aiao/rxdb-plugin-replay';

const markers = await db.replay.listCommitMarkers(sessionId); // { seq, timestamp, commitId, branchId }[]
const result = await db.replay.restoreToCommit(markers[0].commitId);
if (!result.ok) console.warn(replayRestoreHint(result.reason));
```

`restoreToCommit()` 每次都现取工作树凭据再调 `workingTree.restore()`。被拒绝时 `reason` 是下面之一，用 `replayRestoreHint(reason)` 取提示文案：

| `reason`              | 含义                               |
| --------------------- | ---------------------------------- |
| `conflict`            | 恢复过程中工作树变了，重试即可     |
| `dirty_working_tree`  | 工作树有未提交的改动，先提交或丢弃 |
| `incompatible_schema` | 目标提交由不兼容的 schema 版本写入 |
| `unreachable_target`  | 目标提交不在当前分支的历史上       |

没装工作树插件时，`restoreToCommit()` 抛 `working_tree_unavailable`。

## 回放

框架无关的入口是 `mountReplayer(host, options)`。它在 `host` 里挂出 rrweb 回放 iframe、播放 / 暂停按钮、时间轴（`aria-label="Timeline"`）和 commit 标记列表（`aria-label="Commits"`），返回 `play` / `pause` / `seek` / `update` / `destroy` 句柄。点 commit 标记会先跳到那一刻，再调用 `restoreToCommit()`，结果写进 `role="status"` 的状态行，并经 `onCommitRestore` 交给调用方。

三框架组件包装的是同一个回放器，API 对称：

| 能力     | Angular `ao-replayer`              | React `Replayer`       | Vue `Replayer`              |
| -------- | ---------------------------------- | ---------------------- | --------------------------- |
| 门面     | `[replay]`                         | `replay`               | `:replay`                   |
| 会话     | `[sessionId]`                      | `sessionId`            | `:session-id`               |
| 起始时刻 | `[initialTime]`                    | `initialTime`          | `:initial-time`             |
| 时刻变化 | `(aoTimeChange)`                   | `onTimeChange`         | `@time-change`              |
| 恢复结果 | `(aoCommitRestore)`                | `onCommitRestore`      | `@commit-restore`           |
| 命令     | 模板引用 `play` / `pause` / `seek` | `ref`（`ReplayerRef`） | 模板 `ref`（`ReplayerRef`） |

### Angular

```typescript
import { ReplayerComponent } from '@aiao/rxdb-plugin-replay-angular';

@Component({
  imports: [ReplayerComponent],
  template: `
    <ao-replayer #player [replay]="replay" [sessionId]="sessionId" (aoTimeChange)="time.set($event)" />
    <button (click)="player.play()" type="button">播放</button>
  `
})
export class SessionPlayer {
  readonly replay = inject(RxDB).replay;
  readonly sessionId = 'session-id';
  readonly time = signal(0);
}
```

### React

```tsx
import { Replayer, type ReplayerRef } from '@aiao/rxdb-plugin-replay-react';

export function SessionPlayer({ replay, sessionId }: { replay: ReplayManager; sessionId: string }) {
  const player = useRef<ReplayerRef>(null);
  return (
    <>
      <Replayer ref={player} replay={replay} sessionId={sessionId} onTimeChange={console.log} />
      <button onClick={() => player.current?.play()}>播放</button>
    </>
  );
}
```

### Vue

```vue
<script lang="ts" setup>
import { Replayer, type ReplayerRef } from '@aiao/rxdb-plugin-replay-vue';

defineProps<{ replay: ReplayManager; sessionId: string }>();
const player = useTemplateRef<ReplayerRef>('player');
</script>

<template>
  <Replayer :replay="replay" :session-id="sessionId" @time-change="console.log" ref="player" />
  <button @click="player?.play()" type="button">播放</button>
</template>
```

## 错误

业务错误统一抛 `RxDBReplayError`，请按 `code` 分支，不要匹配 `message`：

| `code`                     | 何时                                          |
| -------------------------- | --------------------------------------------- |
| `not_installed`            | 插件还没装进连接纪元，或纪元已释放            |
| `no_dom`                   | 没有 DOM 的环境里 `start()`                   |
| `already_recording`        | 已在录制时再 `start()`                        |
| `store_limit`              | 录制库总量已超上限，拒绝开新会话              |
| `recording_db_unavailable` | 录制库工厂抛错，或返回的库连不上              |
| `session_not_found`        | 会话不存在                                    |
| `session_recording`        | 删除正在录制的会话                            |
| `working_tree_unavailable` | 没装工作树插件时 `restoreToCommit()`          |
| `invalid_marker`           | 标记事件的 payload 形状不对（数据被外部改过） |

## 示例

`apps/dev-rxdb-angular` 带一个默认关闭的演示：在 `/replay` 页打开录制开关后重新加载，录制模块与 rrweb 才会加载。录制库是主线程 IDB 上的 `<dbName>-replay`。
