# DevToolsErrorFramePayload

Defined in: [v2/wire.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L142)

`ERROR` payload; a `null` `requestId` denotes a session-level error with no corresponding
request.

## Properties

### error \{#error\}

```ts
readonly error: DevToolsErrorPayload;
```

Defined in: [v2/wire.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L144)

***

### requestId \{#requestid\}

```ts
readonly requestId: string | null;
```

Defined in: [v2/wire.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L143)
