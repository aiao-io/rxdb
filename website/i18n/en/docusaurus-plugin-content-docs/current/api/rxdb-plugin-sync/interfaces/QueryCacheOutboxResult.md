# QueryCacheOutboxResult

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L97)

The result of one round of outbound replay, the return value of [flushQueryCacheOutbox](../functions/flushQueryCacheOutbox.md).

## Remarks

The four net-operation counts (`replayed` / `discarded` / `noop` and
`failures.length`) are mutually exclusive and exhaustive: each net operation
after compression falls into exactly one of them. `originalCount - compacted`
is the total number of net operations.

## Properties

### compacted \{#compacted\}

```ts
compacted: number;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L103)

The number of original change rows cancelled out by local compression

***

### conflicts \{#conflicts\}

```ts
conflicts: string[];
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L119)

The entity ids where the remote won the conflict judgment — the batch whose local changes made while offline were dropped.

#### Remarks

Only collects those the resolver explicitly judged `KEEP_REMOTE`. "The remote
row no longer exists" is not a conflict: in that case there is no competing
write to compare, and the local intent is converged away rather than judged
the loser (see `MISSING_REMOTE`).

***

### discarded \{#discarded\}

```ts
discarded: number;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L107)

The number of net operations that lost the LWW judgment and whose local changes were dropped

***

### failures \{#failures\}

```ts
failures: QueryCacheOutboxFailure[];
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L121)

This round's failures; non-empty means the waterline did not advance

***

### noop \{#noop\}

```ts
noop: number;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L109)

The number of net operations where the remote state already satisfied the intent and no request was sent

***

### originalCount \{#originalcount\}

```ts
originalCount: number;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L101)

The number of original change rows read

***

### replayed \{#replayed\}

```ts
replayed: number;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L105)

The number of net operations really sent and succeeded

***

### repository \{#repository\}

```ts
repository: object;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L99)

The repository processed this round

#### entity

```ts
entity: string;
```

#### namespace

```ts
namespace: string;
```

***

### skipped? \{#skipped\}

```ts
skipped?: string;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L123)

The reason the whole round was skipped (e.g. the sync switch is turned off)

***

### watermark \{#watermark\}

```ts
watermark: number | null;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L111)

The change id the waterline advanced to; `null` when this round did not advance
