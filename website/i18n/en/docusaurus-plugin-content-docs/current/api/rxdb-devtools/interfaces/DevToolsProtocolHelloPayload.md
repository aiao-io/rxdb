# DevToolsProtocolHelloPayload

Defined in: [v2/wire.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L109)

The `PROTOCOL_HELLO` payload.

## Properties

### supportedVersions \{#supportedversions\}

```ts
readonly supportedVersions: readonly number[];
```

Defined in: [v2/wire.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L111)

Non-empty, strictly descending, deduplicated, ≤ 8 items, each within 1–255.
