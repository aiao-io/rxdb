# DevToolsTransferStartPayload

Defined in: [v2/wire.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L154)

The `TRANSFER_START` payload.

## Properties

### requestId \{#requestid\}

```ts
readonly requestId: string;
```

Defined in: [v2/wire.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L157)

The request that initiated this transfer; used to attribute the transfer's terminal state to a REQUEST.

***

### totalBytes \{#totalbytes\}

```ts
readonly totalBytes: number;
```

Defined in: [v2/wire.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L159)

The declared total decoded byte count; whether it exceeds the limit is judged by the negotiated three-party minimum, not at the wire layer.

***

### transferId \{#transferid\}

```ts
readonly transferId: string;
```

Defined in: [v2/wire.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L155)
