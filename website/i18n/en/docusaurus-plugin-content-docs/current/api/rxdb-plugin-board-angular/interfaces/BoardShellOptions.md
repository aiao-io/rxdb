# BoardShellOptions

Defined in: packages/rxdb-plugin-board/dist/board-shell.d.ts:63

Host configuration of [BoardShellController](../../rxdb-plugin-board/classes/BoardShellController.md).

## Properties

### adapterName \{#adaptername\}

```ts
readonly adapterName: string;
```

Defined in: packages/rxdb-plugin-board/dist/board-shell.d.ts:71

Name of the local adapter (the one registered via `rxdb.adapter(name, …)`).

***

### createRxdb \{#createrxdb\}

```ts
readonly createRxdb: (dbName) => RxDB;
```

Defined in: packages/rxdb-plugin-board/dist/board-shell.d.ts:69

Creates a **not-yet-connected** board instance by database name: entities, plugins, and the local adapter named [BoardShellOptions.adapterName](#adaptername) are installed by the host,
and the database name is assigned by the shell. The adapter must support backup / restore ([BoardBackupAdapter](../../rxdb-plugin-board/interfaces/BoardBackupAdapter.md)); the first-round supported combination is sqlite-wasm main thread
`vfs: 'idb'` (US-537).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dbName` | `string` |

#### Returns

[`RxDB`](../../rxdb/classes/RxDB.md)

***

### onRxdbActivated? \{#onrxdbactivated\}

```ts
readonly onRxdbActivated?: (rxdb) => void;
```

Defined in: packages/rxdb-plugin-board/dist/board-shell.d.ts:75

Host callback after the active board switch completes; temporary instances used by backup and cleanup do not trigger it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`void`

***

### runtime? \{#runtime\}

```ts
readonly runtime?: BoardShellRuntime;
```

Defined in: packages/rxdb-plugin-board/dist/board-shell.d.ts:77

Browser capabilities (default [browserBoardShellRuntime](../../rxdb-plugin-board/functions/browserBoardShellRuntime.md)).

***

### seed? \{#seed\}

```ts
readonly seed?: (rxdb) => Promise<void>;
```

Defined in: packages/rxdb-plugin-board/dist/board-shell.d.ts:73

Demo data loader (e.g. `seedReleaseBoardDataset`); when not provided, no demo data entry is offered.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`Promise`&lt;`void`&gt;
