# DevToolsRequestPayload

Defined in: [v2/wire.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L128)

The `REQUEST` payload; the domain shape of `params` is validated by the provider layer, and the wire layer only guarantees the key exists.

## Properties

### domain \{#domain\}

```ts
readonly domain: "database" | "files" | "settings";
```

Defined in: [v2/wire.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L130)

***

### operation \{#operation\}

```ts
readonly operation: string;
```

Defined in: [v2/wire.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L131)

***

### params \{#params\}

```ts
readonly params: unknown;
```

Defined in: [v2/wire.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L132)

***

### requestId \{#requestid\}

```ts
readonly requestId: string;
```

Defined in: [v2/wire.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L129)
