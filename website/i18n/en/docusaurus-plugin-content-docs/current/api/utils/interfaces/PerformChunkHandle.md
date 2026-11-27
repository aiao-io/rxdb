# PerformChunkHandle

Defined in: [packages/utils/src/@browser/perform-chunk.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/perform-chunk.ts#L21)

The control handle of [performChunk](../functions/performChunk.md).

## Properties

### done \{#done\}

```ts
done: Promise<void>;
```

Defined in: [packages/utils/src/@browser/perform-chunk.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/perform-chunk.ts#L25)

Resolves once all consumption completes; rejects when `consumer` throws, and also resolves on cancel.

## Methods

### cancel() \{#cancel\}

```ts
cancel(): void;
```

Defined in: [packages/utils/src/@browser/perform-chunk.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/perform-chunk.ts#L23)

Stops subsequent chunks; already-consumed items are not rolled back.

#### Returns

`void`
