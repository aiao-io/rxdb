# useRxDBRef()

```ts
function useRxDBRef(): RxDBRef<RxDB>;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L210)

Gets the provided reactive RxDB reference.

## Returns

[`RxDBRef`](../type-aliases/RxDBRef.md)&lt;[`RxDB`](../../rxdb/classes/RxDB.md)&gt;

The read-only reference from the current provider, allowing the database to become ready asynchronously.

## Throws

Throws when no RxDB provider is found.
