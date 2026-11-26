# useRxDB()

```ts
function useRxDB(): RxDB;
```

Defined in: [rxdb-angular/src/rxdb.provider.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb.provider.ts#L145)

Reads the RxDB instance from the current injector.

## Returns

[`RxDB`](../../rxdb/classes/RxDB.md)

The ready RxDB instance

## Throws

Throws when there is no [provideRxDB](provideRxDB.md), the database is not ready yet, or creation failed

## Remarks

Equivalent to `inject(RxDB)`; exists to share the name and semantics of React / Vue's `useRxDB()`. Must be called in an injection context.
