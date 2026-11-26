# asPGliteChangeEventSource()

```ts
function asPGliteChangeEventSource(client): PGliteChangeEventSource | undefined;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:365](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L365)

Narrows a client down to a change event source; returns `undefined` when it lacks that capability.

## Parameters

| Parameter | Type                                              | Description       |
| --------- | ------------------------------------------------- | ----------------- |
| `client`  | [`IPGliteClient`](../interfaces/IPGliteClient.md) | Any PGlite client |

## Returns

\| [`PGliteChangeEventSource`](../interfaces/PGliteChangeEventSource.md)
\| `undefined`

The change event source, or `undefined`
