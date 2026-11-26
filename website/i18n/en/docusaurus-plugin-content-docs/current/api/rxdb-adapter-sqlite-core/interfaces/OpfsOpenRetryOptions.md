# OpfsOpenRetryOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L37)

Options of [openOpfsWithRetry](../functions/openOpfsWithRetry.md).

## Properties

### delaysMs? \{#delaysms\}

```ts
readonly delaysMs?: readonly number[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L43)

Backoff delay sequence; defaults to six steps starting at 50 ms and doubling each time (about 3 seconds in total)

***

### fileName \{#filename\}

```ts
readonly fileName: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L39)

The database file named in error messages

***

### isAccessHandleBusy \{#isaccesshandlebusy\}

```ts
readonly isAccessHandleBusy: () => Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L41)

Whether the database file's synchronous access handle is currently held by another context

#### Returns

`Promise`&lt;`boolean`&gt;

***

### sleep? \{#sleep\}

```ts
readonly sleep?: (ms) => Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L45)

The wait implementation; injected by tests

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ms` | `number` |

#### Returns

`Promise`&lt;`void`&gt;
