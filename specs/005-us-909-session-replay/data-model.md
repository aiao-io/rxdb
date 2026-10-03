# Data Model: US-909 阶段 C

**Date**: 2026-10-02 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

全部实体只存在于**录制库**（`createRecordingDb` 工厂造出的那个 `RxDB`），不进被录应用库。

## 1. 实体

两个实体都是 `namespace: 'replay'`、`log: false`、`sync: { type: SyncType.None }`，由 `@aiao/rxdb-plugin-replay` 导出给工厂用
（`REPLAY_ENTITIES`），应用不应直接读写它们，一律经 `rxdb.replay`。

### 1.1 `ReplaySessionRecord`（表 `replay_session`）

| 字段            | 类型                                            | 约束                                                        |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `id`            | `string`                                        | 主键；`start()` 时 `crypto.randomUUID()`                    |
| `startedAt`     | `date`                                          | 必填；`start()` 时刻                                        |
| `lastEventAt`   | `date`，可空                                    | 最后一次成功落库那批里最大的事件时间戳；尚无事件时为 `null` |
| `status`        | `enum`：`recording` \| `stopped` \| `truncated` | 必填；状态机见 §3                                           |
| `truncatedCode` | `enum`：`session_limit` \| `store_limit`，可空  | `status === 'truncated'` 时必有，否则 `null`                |
| `eventCount`    | `integer`                                       | ≥ 0；已落库事件行数（含标记）                               |
| `bytes`         | `integer`                                       | ≥ 0；已落库事件行 `bytes` 之和                              |
| `nextSeq`       | `integer`                                       | ≥ 0；下一条要落库事件的 `seq` 下界；与事件行同事务推进      |

### 1.2 `ReplayEventRecord`（表 `replay_event`）

| 字段        | 类型      | 约束                                                                |
| ----------- | --------- | ------------------------------------------------------------------- |
| `id`        | `string`  | 主键，`${sessionId}:${seq}`                                         |
| `sessionId` | `string`  | 必填；指向 `ReplaySessionRecord.id`（不建外键，删除由插件按序执行） |
| `seq`       | `integer` | ≥ 0；会话内严格递增，跨刷新连续（D5）                               |
| `type`      | `integer` | rrweb `EventType` 数值（冗余列，便于只按类型过滤）                  |
| `timestamp` | `number`  | rrweb 事件的 `timestamp`（epoch ms）                                |
| `data`      | `json`    | **整条** rrweb 事件（`eventWithTime`），读出即可交给 `Replayer`     |
| `bytes`     | `integer` | `> 0`；`new TextEncoder().encode(JSON.stringify(event)).length`     |

**索引**：`(sessionId, seq)` 唯一；`(sessionId, timestamp)`。

**规则**

- 事件行只增不改；只有 `deleteSession()` 删除（先删事件行，再删会话行，同一事务）。
- 会话行的 `bytes` / `eventCount` / `nextSeq` / `lastEventAt` 只在写事件行的同一事务里改（D4）。
- 读事件一律 `ORDER BY seq`。

## 2. 标记事件

标记是 rrweb `EventType.Custom`（数值 5）事件，`data = { tag, payload }`，与普通事件同表、同样计 `bytes`、同样占一个 `seq`。

| `tag`                   | `payload`                                                        | 何时写                                                        |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `rxdb-replay:commit`    | `{ commitId: string; branchId: string }`                         | 录制中收到 `workingTree.commits$`，经 `record.addCustomEvent` |
| `rxdb-replay:truncated` | `{ code: 'session_limit' \| 'store_limit'; limitBytes: number }` | 冲刷时超限（D4），写在本批首个 `seq` 上，之后不再有事件       |
| `rxdb-replay:gap`       | `{ reason: 'stash_unavailable' }`                                | 刷新续录时只拿到最小暂存（D5），写在会话 `nextSeq` 上         |

解析由导出纯函数 `parseReplayMarker(event)` 完成：不是这三个 tag 之一 → `null`；tag 对但 payload 形状不对 → 抛 `RxDBReplayError('invalid_marker')`
（库里不会有这种行，出现即数据被外部改过，不猜）。

## 3. 状态机

### 3.1 会话行 `status`

```text
(start)            ──▶ recording
recording ── stop() 冲刷成功 ──▶ stopped
recording ── 冲刷超限 ──▶ truncated（truncatedCode 必填）
recording ── 冲刷失败 / 标签页关闭 ──▶ recording（停留；`lastEventAt` 说明它停在哪）
stopped / truncated ──▶ 终态（只能 deleteSession）
```

刷新续录只发生在 `recording` 会话上；读到的会话行若已不是 `recording`（例如另一个标签页把它删了或停了），清掉暂存、不续录、
`state$` 回 `idle`。

### 3.2 `rxdb.replay.state$`

```ts
type ReplayState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'recording'; readonly sessionId: string }
  | { readonly kind: 'truncated'; readonly sessionId: string; readonly code: ReplayTruncatedCode }
  | { readonly kind: 'error'; readonly sessionId: string | null; readonly error: Error };
```

| 当前                           | 事件                     | 下一个                                 |
| ------------------------------ | ------------------------ | -------------------------------------- |
| `idle` / `truncated` / `error` | `start()` 成功           | `recording`                            |
| `idle` / `truncated` / `error` | `start()` 失败           | 不变（错误由 `start()` 抛出）          |
| `recording`                    | `stop()` 成功            | `idle`                                 |
| `recording`                    | `stop()` 失败 / 冲刷失败 | `error`                                |
| `recording`                    | 冲刷超限                 | `truncated`                            |
| `recording`                    | `start()`                | 不变，`start()` 抛 `already_recording` |

初始值是 `idle`；作用域释放后不再发值（Subject 完成）。

## 4. 刷新暂存

| 键                              | 存放             | 值                                                                   |
| ------------------------------- | ---------------- | -------------------------------------------------------------------- |
| `rxdb-replay:active:<应用库名>` | `sessionStorage` | `{ v: 1, sessionId, nextSeq, events: { seq, event }[], gap?: true }` |

`<应用库名>` = 被录 `rxdb.config.dbName`。只在 `pagehide` 写、在下一次安装时读并**立刻删除**、在 `stop()` / 截断 / `pageshow(persisted)`
时删除（D5）。`v` 不是 1、JSON 解析失败、字段形状不对 → 删键、当作没有暂存，并经 `state$` 发 `error`（`sessionId` 取得到就带上）；
不续录也不猜。

## 5. 对外结果类型

```ts
interface ReplaySessionInfo {
  readonly id: string;
  readonly startedAt: Date;
  readonly lastEventAt: Date | null;
  readonly status: 'recording' | 'stopped' | 'truncated';
  readonly truncatedCode: ReplayTruncatedCode | null;
  readonly eventCount: number;
  readonly bytes: number;
}

interface ReplayUsage {
  readonly bytes: number; // 全部会话 bytes 之和
  readonly sessionCount: number;
  readonly limits: { readonly sessionBytes: number; readonly storeBytes: number };
}

interface ReplaySessionExport {
  readonly format: 'aiao-rxdb-replay-session';
  readonly version: 1;
  readonly session: ReplaySessionInfo; // Date 序列化为 ISO 字符串由调用方 JSON.stringify 决定
  readonly events: readonly eventWithTime[];
}

interface ReplayCommitMarker {
  readonly seq: number;
  readonly timestamp: number;
  readonly commitId: string;
  readonly branchId: string;
}
```

`listSessions()` 按 `startedAt` 倒序。`readEvents()` 返回 `eventWithTime[]`（`data` 列原样），`listCommitMarkers(sessionId)` 返回
`ReplayCommitMarker[]`（按 `seq`）。

## 6. 工作树门面新增（跨包）

```ts
/** `WorkingTreeManager.commits$` 每次发出的值。 */
interface WorkingTreeCommitEvent {
  readonly commitId: string;
  readonly branchId: string;
}
```

发出条件与不发出的情形见 research D7 与 [contracts/working-tree-commits.md](contracts/working-tree-commits.md)。
