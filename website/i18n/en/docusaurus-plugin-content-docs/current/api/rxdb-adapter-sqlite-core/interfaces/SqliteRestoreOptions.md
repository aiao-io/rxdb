# SqliteRestoreOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L62)

SQLite restore options.

## Extends

- [`RxDBRestoreOptions`](../../rxdb/interfaces/RxDBRestoreOptions.md)

## Properties

### onStage? \{#onstage\}

```ts
readonly onStage?: (stage) => void | Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L69)

Stage callback; will be `await`-ed.

#### Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `stage`   | [`SqliteRestoreStage`](../type-aliases/SqliteRestoreStage.md) |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

#### Remarks

Used for progress display and crash-injection tests; a callback throwing is equivalent to a restore failure and goes through the full failure cleanup.

---

### signal? \{#signal\}

```ts
readonly signal?: AbortSignal;
```

Defined in: packages/rxdb/dist/backup/backup.interface.d.ts:137

Cancels before the successful commit boundary.

#### Inherited from

[`RxDBRestoreOptions`](../../rxdb/interfaces/RxDBRestoreOptions.md).[`signal`](../../rxdb/interfaces/RxDBRestoreOptions.md#signal)
