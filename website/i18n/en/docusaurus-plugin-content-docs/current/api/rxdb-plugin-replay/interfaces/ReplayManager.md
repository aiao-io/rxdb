# ReplayManager

Defined in: [packages/rxdb-plugin-replay/src/types.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L94)

Recording/replay entry point (`rxdb.replay`).

## Remarks

Except `state$`, all members reject `RxDBReplayError('not_installed')` when the plugin is not installed (before `connect()`) or the scope has been released.

## Properties

### state$ \{#state\}

```ts
readonly state$: Observable<ReplayState>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L96)

Recording state; new subscribers receive the current value immediately.

## Methods

### deleteSession() \{#deletesession\}

```ts
deleteSession(sessionId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L131)

Deletes a session and all of its events (in the same transaction). This is the only way to free recording database space; the plugin never deletes automatically.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sessionId` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

`RxDBReplayError`: `session_recording` (still recording), `session_not_found`

***

### exportSession() \{#exportsession\}

```ts
exportSession(sessionId): Promise<ReplaySessionExport>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L125)

Exports the whole session (can be `JSON.stringify`ed for archiving or sharing).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sessionId` | `string` |

#### Returns

`Promise`&lt;[`ReplaySessionExport`](ReplaySessionExport.md)&gt;

#### Throws

`RxDBReplayError('session_not_found')`

***

### listCommitMarkers() \{#listcommitmarkers\}

```ts
listCommitMarkers(sessionId): Promise<ReplayCommitMarker[]>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L119)

Commit markers in the session, in ascending `seq` order.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sessionId` | `string` |

#### Returns

`Promise`&lt;[`ReplayCommitMarker`](ReplayCommitMarker.md)[]&gt;

#### Throws

`RxDBReplayError('session_not_found')`

***

### listSessions() \{#listsessions\}

```ts
listSessions(): Promise<ReplaySessionInfo[]>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L107)

All sessions, in descending `startedAt` order.

#### Returns

`Promise`&lt;[`ReplaySessionInfo`](ReplaySessionInfo.md)[]&gt;

***

### readEvents() \{#readevents\}

```ts
readEvents(sessionId, range?): Promise<eventWithTime[]>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L113)

Reads the events of a session in ascending `seq` order; when a range is given, only events whose `timestamp` falls inside it are read.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sessionId` | `string` |
| `range?` | [`ReplayEventRange`](ReplayEventRange.md) |

#### Returns

`Promise`&lt;`eventWithTime`[]&gt;

#### Throws

`RxDBReplayError('session_not_found')`

***

### restoreToCommit() \{#restoretocommit\}

```ts
restoreToCommit(commitId): Promise<ReplayRestoreResult>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L139)

Restores the working tree to a commit (fetches fresh credentials from the moment before the restore and calls `workingTree.restore()`).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `commitId` | `string` |

#### Returns

`Promise`&lt;[`ReplayRestoreResult`](../type-aliases/ReplayRestoreResult.md)&gt;

#### Throws

`RxDBReplayError('working_tree_unavailable')`: the working tree plugin is not installed; other errors are passed through as-is

***

### start() \{#start\}

```ts
start(): Promise<string>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L103)

Starts recording a new session.

#### Returns

`Promise`&lt;`string`&gt;

Id of the new session

#### Throws

`RxDBReplayError`: `no_dom`, `already_recording`, `store_limit`, `recording_db_unavailable`

***

### stop() \{#stop\}

```ts
stop(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L105)

Stops recording and flushes remaining events; returns immediately when not recording. Throws the original error when the flush fails.

#### Returns

`Promise`&lt;`void`&gt;

***

### usage() \{#usage\}

```ts
usage(): Promise<ReplayUsage>;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L133)

Current usage of the recording database and the effective limits.

#### Returns

`Promise`&lt;[`ReplayUsage`](ReplayUsage.md)&gt;
