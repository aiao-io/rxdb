# BoardShellOptions

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L93)

Host configuration for [BoardShellController](../classes/BoardShellController.md).

## Properties

### adapterName \{#adaptername\}

```ts
readonly adapterName: string;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L101)

The local adapter name (the one registered via `rxdb.adapter(name, …)`).

***

### createRxdb \{#createrxdb\}

```ts
readonly createRxdb: (dbName) => RxDB;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L99)

Creates a **not-yet-connected** board instance by database name: the entities, plugins and the local adapter named [BoardShellOptions.adapterName](#adaptername) are installed by the host,
the database name is assigned by the shell. The adapter must support backup / restore ([BoardBackupAdapter](BoardBackupAdapter.md)); the first-round supported combination is sqlite-wasm main thread
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

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L105)

Host callback after the active board switch completes; temporary instances used for backup and cleanup do not trigger it.

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

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L107)

Browser capabilities (defaults to [browserBoardShellRuntime](../functions/browserBoardShellRuntime.md)).

***

### seed? \{#seed\}

```ts
readonly seed?: (rxdb) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L103)

Demo data loading function (e.g. `seedReleaseBoardDataset`); when absent, no demo data entry is offered.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`Promise`&lt;`void`&gt;
