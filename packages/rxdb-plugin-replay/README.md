# @aiao/rxdb-plugin-replay

`@aiao/rxdb` 的会话录制回放插件，**默认不录**，由应用显式开始。它用 rrweb 录下页面 DOM，事件写进一个**独立的录制库**，被录的应用库里不多一行数据。回放时间轴上会标出工作树的 commit，点一下标记，就能把工作树恢复到那次提交。

rrweb 钉在精确版本 `2.1.6`。回放组件按需 `import('rrweb')`，所以不打开回放视图，rrweb 回放端就不会被加载。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay rxjs
# 需要 commit 标记与恢复时再装（可选 peer）
pnpm add @aiao/rxdb-plugin-working-tree
```

## 用法

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginReplay } from '@aiao/rxdb-plugin-replay';

// 录制库工厂：返回另一个 RxDB，不要返回被录的应用库
const createRecordingDb = entities =>
  new RxDB({
    dbName: 'my-app-replay',
    entities: [...entities],
    multiInstance: false,
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  }).adapter('sqlite-wasm', async db => new RxDBAdapterSqlite(db, sqliteOptions));

db.use(rxDBPluginReplay, {
  createRecordingDb,
  limits: { sessionBytes: 16 * 1024 * 1024, storeBytes: 128 * 1024 * 1024 },
  record: { maskTextSelector: '.secret' }
});
await db.connect('sqlite-wasm');

const sessionId = await db.replay.start();
// …用户操作…
await db.replay.stop();

const sessions = await db.replay.listSessions(); // 状态 / 事件数 / 体积
const events = await db.replay.readEvents(sessionId);
```

录制库工厂在每个连接纪元里只调用一次，时机是第一次需要存储时。返回的库如果还没 `init()`，插件会先替它 `init()`，再 `connect()`，作用域释放时一并 `destroy()`。工厂抛错或返回的库连不上时，插件抛 `RxDBReplayError('recording_db_unavailable')`，下一次调用会重新调用工厂。

`db.replay` 是 `ReplayManager`，成员如下：

- 录制：`state$`、`start()`、`stop()`
- 读取：`listSessions()`、`readEvents(id, range?)`、`listCommitMarkers(id)`、`exportSession(id)`
- 空间：`deleteSession(id)`、`usage()`
- 恢复：`restoreToCommit(commitId)`

页面刷新时，录制会话会通过 `sessionStorage` 暂存续上同一个 id：还没冲刷的事件不会丢，暂存不完整时写一条 `gap` 标记。

## 体积上限

上限按事件 `JSON.stringify` 后的 UTF-8 字节计，两项都可配置：

| 选项                  | 默认    | 超出时                                                                           |
| --------------------- | ------- | -------------------------------------------------------------------------------- |
| `limits.sessionBytes` | 16 MiB  | 该会话停录，写一条 `truncated` 标记（`session_limit`），会话状态变为 `truncated` |
| `limits.storeBytes`   | 128 MiB | `start()` 抛 `RxDBReplayError('store_limit')`                                    |

插件**绝不自动删除**旧录像，释放空间只能调用 `deleteSession()`。

## 脱敏

- `maskAllInputs` 默认为 `true`，输入框里的值只录成同样长度的 `*`。
- 给元素加上 `data-rxdb-replay-block` 属性（`REPLAY_BLOCK_SELECTOR`），它在录像里就只剩一个同尺寸的占位块。这个选择器总会并入你传的 `record.blockSelector`。
- `record` 透传 rrweb 的 `maskInputOptions` / `maskTextSelector` / `maskTextClass` / `blockSelector` / `blockClass` / `ignoreSelector`，含义以 rrweb 文档为准。

## commit 标记与恢复

被录的库装了 `@aiao/rxdb-plugin-working-tree` 时，录制中的每次提交都会写一条 `commit` 标记（rrweb Custom 事件，`tag` 为 `rxdb-replay:commit`）。标记来自工作树门面的 `commits$`。

`restoreToCommit(commitId)` 每次调用时都现取工作树凭据，再调 `workingTree.restore()`。被拒绝时用 `replayRestoreHint(reason)` 取提示文案，可能的 `reason`：

- `conflict`
- `dirty_working_tree`
- `incompatible_schema`
- `unreachable_target`

没装工作树插件时抛 `working_tree_unavailable`。

## 回放

`mountReplayer(host, { replay, sessionId, initialTime, onTimeChange, onCommitRestore })` 会在 `host` 里挂出以下内容：

- rrweb 回放 iframe
- 播放 / 暂停按钮
- 时间轴
- commit 标记列表

它返回 `play` / `pause` / `seek` / `update` / `destroy` 句柄。三个框架的封装 API 对称：

- Angular：[`@aiao/rxdb-plugin-replay-angular`](../rxdb-plugin-replay-angular)
- React：[`@aiao/rxdb-plugin-replay-react`](../rxdb-plugin-replay-react)
- Vue：[`@aiao/rxdb-plugin-replay-vue`](../rxdb-plugin-replay-vue)

## 错误

插件的业务错误统一抛 `RxDBReplayError`，请按 `code` 分支处理，不要匹配 `message`。可能的 `code`：

- `no_dom`
- `already_recording`
- `store_limit`
- `recording_db_unavailable`
- `session_not_found`
- `session_recording`
- `working_tree_unavailable`
- `invalid_marker`
- `not_installed`

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 插件指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
