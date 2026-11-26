# PGliteRestoreOptions

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L65)

PGlite restore options.

## Extends

- [`RxDBRestoreOptions`](../../rxdb/interfaces/RxDBRestoreOptions.md)

## Properties

### onStage? \{#onstage\}

```ts
readonly onStage?: (stage) => void | Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L72)

Stage callback, which is `await`ed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `stage` | [`PGliteRestoreStage`](../type-aliases/PGliteRestoreStage.md) |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

#### Remarks

Used for progress display and crash injection tests; an error thrown by the callback counts as a restore failure and goes through the full failure cleanup.

***

### signal? \{#signal\}

```ts
readonly signal?: AbortSignal;
```

Defined in: packages/rxdb/dist/backup/backup.interface.d.ts:137

Cancels before the successful commit boundary.

#### Inherited from

[`RxDBRestoreOptions`](../../rxdb/interfaces/RxDBRestoreOptions.md).[`signal`](../../rxdb/interfaces/RxDBRestoreOptions.md#signal)
