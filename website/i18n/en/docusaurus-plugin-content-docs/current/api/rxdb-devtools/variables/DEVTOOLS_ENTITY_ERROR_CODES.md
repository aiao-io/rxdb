# DEVTOOLS_ENTITY_ERROR_CODES

```ts
const DEVTOOLS_ENTITY_ERROR_CODES: readonly ["ENTITY_NOT_FOUND", "ENTITY_AMBIGUOUS", "RXDB_NOT_READY", "KEYRING_LOCKED"];
```

Defined in: [types.ts:333](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L333)

Structured error codes of `ENTITY_DATA`.

## Remarks

The panel branches on these and does not match the `error` copy (copy is for humans and may change at any time).
`ENTITY_NOT_FOUND` in particular means **the peer did not register this entity** (e.g. the page does not have the corresponding plugin installed),
which is an explainable normal state and must not be rendered as a query failure.

Strict on the production side, lenient on the consumption side: the connector only ever sends codes listed here, but
[isDevToolsMessage](../functions/isDevToolsMessage.md) still validates `errorCode` only as a "non-empty string",
keeping old and new connectors / panels bidirectionally compatible.
