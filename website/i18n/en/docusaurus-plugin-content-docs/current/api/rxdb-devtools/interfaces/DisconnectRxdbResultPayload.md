# DisconnectRxdbResultPayload

Defined in: [types.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L168)

The result payload of disconnecting an RxDB instance.

## Remarks

The three fields are not independent: `status` determines `success` and `error`.
`failed` ⇒ `success === false` and `error` is non-empty; all other statuses ⇒ `success === true` and `error === null`.
This matrix is enforced by [isDevToolsMessage](../functions/isDevToolsMessage.md) at the protocol boundary; see its `DISCONNECT_RXDB_RESULT` branch.

## Properties

### error \{#error\}

```ts
error: string | null;
```

Defined in: [types.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L174)

The failure reason; `null` on success.

***

### requestId \{#requestid\}

```ts
requestId: string;
```

Defined in: [types.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L170)

Echoes the request's `requestId`, used to match the result back to the requester.

***

### status \{#status\}

```ts
status: DisconnectStatus;
```

Defined in: [types.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L176)

Which path the disconnect took.

***

### success \{#success\}

```ts
success: boolean;
```

Defined in: [types.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L172)

Whether it is certain that the instance is no longer held.
