# BoardBackupAdapter

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L62)

Local adapter that supports backup / restore (subset of the public US-217 methods; all sqlite-family adapters have them).

## Methods

### backup() \{#backup\}

```ts
backup(sink): Promise<unknown>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L64)

Generates a complete archive into `sink`; returns only after the archive is fully written and the output end is closed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sink` | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |

#### Returns

`Promise`&lt;`unknown`&gt;

***

### cleanupIncompleteRestore() \{#cleanupincompleterestore\}

```ts
cleanupIncompleteRestore(): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L68)

Cleans up an unfinished restore; `true` when residue was actually cleaned.

#### Returns

`Promise`&lt;`boolean`&gt;

***

### dropStorage() \{#dropstorage\}

```ts
dropStorage(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L70)

Deletes this database's persistent storage (when not connected).

#### Returns

`Promise`&lt;`void`&gt;

***

### restore() \{#restore\}

```ts
restore(source): Promise<unknown>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L66)

Restores into an unconnected empty target (must be before `rxdb.connect()`).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |

#### Returns

`Promise`&lt;`unknown`&gt;
