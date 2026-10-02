# Contract: `@aiao/rxdb-plugin-replay`

**Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

## 1. 安装

```ts
import { rxDBPluginReplay, REPLAY_ENTITIES } from '@aiao/rxdb-plugin-replay';

rxdb.use(
  rxDBPluginReplay(rxdb, {
    createRecordingDb: entities => createMyRecordingDb(`${dbName}-replay`, entities)
  })
);
await rxdb.replay.start();
```

| 项          | 值                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| 插件名      | `replay`（`rxdb.getPlugins('replay')`）                                                                                |
| `lifecycle` | `'scoped'`：每个连接纪元一个作用域，释放时停录制、冲刷、销毁录制库                                                     |
| `inject`    | `['adapter:local']`（只为与连接纪元对齐；插件不读写被录应用库）                                                        |
| 模块增强    | `interface RxDB { readonly replay: ReplayManager }`                                                                    |
| 依赖        | `rrweb@2.1.6`、`@rrweb/types@2.1.6`（精确版本）；peer `@aiao/rxdb`、`rxjs`；可选 peer `@aiao/rxdb-plugin-working-tree` |

## 2. 选项 `RxDBReplayOptions`

| 字段                  | 类型 / 默认                                                        | 校验（构造时，失败抛 `RangeError` / `TypeError`） |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `createRecordingDb`   | `(entities: readonly EntityType[]) => RxDB \| Promise<RxDB>`；必填 | 不是函数 → `TypeError`                            |
| `limits.sessionBytes` | `number`，默认 `16 * 1024 * 1024`                                  | 正的安全整数                                      |
| `limits.storeBytes`   | `number`，默认 `128 * 1024 * 1024`                                 | 正的安全整数，且 `≥ sessionBytes`                 |
| `flush.intervalMs`    | `number`，默认 `1000`                                              | 正的安全整数                                      |
| `flush.maxEvents`     | `number`，默认 `200`                                               | 正的安全整数                                      |
| `record`              | rrweb 记录选项子集（research D6），`maskAllInputs` 默认 `true`     | —                                                 |

工厂返回的库若未 `init()`，插件替它 `init()`；工厂只调用一次 / 纪元，抛错或返回的库连接失败时，触发它的那次调用抛
`RxDBReplayError('recording_db_unavailable')`（`cause` 为原错误），下一次调用重新调用工厂。

## 3. `ReplayManager`（`rxdb.replay`）

| 成员                                  | 返回                                | 说明                                                                                         |
| ------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `state$`                              | `Observable<ReplayState>`           | 见 data-model §3.2；新订阅者立即收到当前值                                                   |
| `start()`                             | `Promise<string>`（会话 id）        | 抛 `no_dom`（无 `document`）、`already_recording`、`store_limit`、`recording_db_unavailable` |
| `stop()`                              | `Promise<void>`                     | 未在录制时直接返回；冲刷失败抛原错误（`state$` → `error`）                                   |
| `listSessions()`                      | `Promise<ReplaySessionInfo[]>`      | `startedAt` 倒序                                                                             |
| `readEvents(sessionId)`               | `Promise<eventWithTime[]>`          | `seq` 升序；会话不存在 → 抛 `session_not_found`                                              |
| `readEvents(sessionId, { from, to })` | 同上                                | `timestamp ∈ [from, to]`，走 `(sessionId, timestamp)` 索引                                   |
| `listCommitMarkers(sessionId)`        | `Promise<ReplayCommitMarker[]>`     | `seq` 升序                                                                                   |
| `exportSession(sessionId)`            | `Promise<ReplaySessionExport>`      | 会话不存在 → `session_not_found`                                                             |
| `deleteSession(sessionId)`            | `Promise<void>`                     | 正在录制的会话 → 抛 `session_recording`；不存在 → `session_not_found`                        |
| `usage()`                             | `Promise<ReplayUsage>`              | —                                                                                            |
| `restoreToCommit(commitId)`           | `Promise<WorkingTreeRestoreResult>` | 无工作树插件 → `working_tree_unavailable`；其余照 `workingTree.restore()`（含其抛出的错误）  |

所有成员在插件未安装 / 作用域已释放时抛 `RxDBReplayError('not_installed')`（`state$` 除外）。

## 4. 错误

```ts
class RxDBReplayError extends Error {
  readonly name = 'RxDBReplayError';
  readonly code: RxDBReplayErrorCode;
}
type RxDBReplayErrorCode =
  | 'no_dom'
  | 'already_recording'
  | 'store_limit'
  | 'recording_db_unavailable'
  | 'session_not_found'
  | 'session_recording'
  | 'working_tree_unavailable'
  | 'invalid_marker'
  | 'not_installed';
```

## 5. 其他导出

| 导出                        | 说明                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REPLAY_ENTITIES`           | `[ReplaySessionRecord, ReplayEventRecord]`，与工厂收到的是同一组                                                                                                                                 |
| `REPLAY_MARKER_TAGS`        | 三个标记 tag 常量（data-model §2）                                                                                                                                                               |
| `parseReplayMarker(event)`  | 见 data-model §2                                                                                                                                                                                 |
| `replayRestoreHint(reason)` | 四种拒绝 → 英文提示（research D8）                                                                                                                                                               |
| `mountReplayer(host, opts)` | 回放视图，见 [replayer-component.md](replayer-component.md)                                                                                                                                      |
| 类型                        | `RxDBReplayOptions`、`ReplayManager`、`ReplayState`、`ReplaySessionInfo`、`ReplayUsage`、`ReplaySessionExport`、`ReplayCommitMarker`、`ReplayTruncatedCode`、`ReplayerHandle`、`ReplayerOptions` |

子路径 `@aiao/rxdb-plugin-replay/testing`：`replayerParityCases`（research D10），只给三个封装包的测试用。

## 6. 与工作树的关系

- 工作树插件是**可选** peer：没装时录制照常，只是没有 commit 标记，`restoreToCommit()` 抛 `working_tree_unavailable`。
- 装了但未启用（`WorkingTreeCapabilityDisabledError`）：`commits$` 本就不会发，`restoreToCommit()` 透传该错误。
- 插件在 `start()` 时订阅 `rxdb.workingTree.commits$`，在 `stop()` / 截断 / 作用域释放时退订。
