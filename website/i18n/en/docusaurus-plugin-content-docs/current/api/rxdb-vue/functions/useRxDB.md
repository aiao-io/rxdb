# useRxDB()

```ts
function useRxDB(): RxDB;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L225)

Gets the current ready RxDB instance.

## Returns

[`RxDB`](../../rxdb/classes/RxDB.md)

The current RxDB instance.

## Throws

No provider and database not ready each throw a distinct message; when an async source fails to create, the creation error is thrown as-is (same semantics as Angular / React).
