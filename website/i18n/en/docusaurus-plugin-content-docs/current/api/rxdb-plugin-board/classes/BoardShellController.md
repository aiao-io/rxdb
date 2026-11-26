# BoardShellController

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L187)

Board host shell orchestration (host half of the US-537 state flow).

- Startup selection: with no active position record, stays in `startup`; before a selection, no connection, no table creation, no seed loading;
- Create new / load demo data / reset to demo data: all create the database under a new database name and only write the active position on success;
- Restore: confirm first if a board already exists; restore to a new database name → write the pending switch record → reload the whole page → write the active position only after a successful read-back; on failure the original database is kept;
- Across pages: the restoring marker makes board views on other pages pause writes; this page reloads when another page rewrites the active position.

## Remarks

Restore, startup read-back and residue cleanup are serialized under [BOARD\_RESTORE\_LOCK](../variables/BOARD_RESTORE_LOCK.md); user actions that cannot get the lock fail immediately, while startup read-back waits for the lock.
Connections that arrive after [BoardShellController.destroy](#destroy) are always disconnected and the state no longer changes (React StrictMode double mounting).

## Constructors

### Constructor

```ts
new BoardShellController(options): BoardShellController;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L207)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`BoardShellOptions`](../interfaces/BoardShellOptions.md) | Host configuration: instance factory, adapter name, optional demo data and runtime |

#### Returns

`BoardShellController`

## Properties

### state$ \{#state\}

```ts
readonly state$: Observable<BoardShellState>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L197)

Shell state stream (emits the current snapshot immediately).

## Accessors

### state \{#state-1\}

#### Get Signature

```ts
get state(): BoardShellState;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L200)

Current state snapshot.

##### Returns

[`BoardShellState`](../interfaces/BoardShellState.md)

## Methods

### destroy() \{#destroy\}

```ts
destroy(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L315)

Teardown: unsubscribes storage events, cancels pending confirmations, disconnects the current board connection; state changes after this are always ignored.

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws the original error when disconnection fails (logged by the component)

***

### downloadBackup() \{#downloadbackup\}

```ts
downloadBackup(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:297](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L297)

Exports the current board: hands the archive to the browser for download only after it is fully generated (export callback of the board view).

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Error when there is no open board; adapter does not support backup

***

### resetDemo() \{#resetdemo\}

```ts
resetDemo(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L248)

Tools menu "Reset to demo data": after confirmation, loads the seed under a new database name and switches to it; the current board stays in the original database.

#### Returns

`Promise`&lt;`void`&gt;

***

### restoreFromFile() \{#restorefromfile\}

```ts
restoreFromFile(archive): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:262](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L262)

Restore from backup: confirm first if a board already exists; after restoring to a new database name the whole page reloads and only a successful read-back switches (US-537).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `archive` | `Blob` | The user-selected `.rxdb` archive |

#### Returns

`Promise`&lt;`void`&gt;

***

### settleConfirm() \{#settleconfirm\}

```ts
settleConfirm(confirmed): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:285](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L285)

Answers the confirmation dialog.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `confirmed` | `boolean` | `true` when the user clicked confirm, `false` on cancel or close |

#### Returns

`void`

***

### start() \{#start\}

```ts
start(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L226)

Starts: subscribes to active position changes and, according to the records, completes pending switches, cleans up interrupted restores, opens the active database or stays at the startup selection.

#### Returns

`Promise`&lt;`void`&gt;

The startup flow has finished (failures are written into [BoardShellState.error](../interfaces/BoardShellState.md#error), not thrown)

***

### startEmpty() \{#startempty\}

```ts
startEmpty(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L238)

Startup selection "Create empty board": creates the database under a new database name and opens it.

#### Returns

`Promise`&lt;`void`&gt;

***

### startSeed() \{#startseed\}

```ts
startSeed(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:243](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L243)

Startup selection "Load demo data": creates the database under a new database name, loads the seed and opens it.

#### Returns

`Promise`&lt;`void`&gt;
