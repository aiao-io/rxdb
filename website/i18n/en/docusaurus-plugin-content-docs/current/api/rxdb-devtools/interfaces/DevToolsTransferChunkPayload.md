# DevToolsTransferChunkPayload

Defined in: [v2/wire.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L163)

The `TRANSFER_CHUNK` payload.

## Properties

### chunkIndex \{#chunkindex\}

```ts
readonly chunkIndex: number;
```

Defined in: [v2/wire.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L165)

***

### dataBase64 \{#database64\}

```ts
readonly dataBase64: string;
```

Defined in: [v2/wire.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L168)

RFC 4648 standard alphabet + canonical padding; **canonicity is judged by the transfer state machine**, see the note below.

***

### offset \{#offset\}

```ts
readonly offset: number;
```

Defined in: [v2/wire.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L166)

***

### transferId \{#transferid\}

```ts
readonly transferId: string;
```

Defined in: [v2/wire.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L164)
