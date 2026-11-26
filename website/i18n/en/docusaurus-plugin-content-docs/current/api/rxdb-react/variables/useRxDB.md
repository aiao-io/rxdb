# useRxDB

```ts
const useRxDB: UseRxDB<RxDB> = defaultProvider.useRxDB;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:371](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L371)

Reads the explicitly passed RxDB, or the nearest [RxDBProvider](RxDBProvider.md).

## Param

**db**

Optional explicit database; reads the nearest Provider when omitted.

## Throws

No Provider in the component tree, the Provider has no `db`, and an async source not ready yet each throw a distinct message; when an async source fails to create, the creation error is thrown as-is; when a Promise source whose Provider was disconnected (unmount or hidden by `<Activity>`) is reconnected, or a factory hands back an already-destroyed instance, an error explaining the reason is thrown (see [RxDBSource](../type-aliases/RxDBSource.md)).
