# EntityDataPayload

Defined in: [types.ts:344](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L344)

Entity query result payload.

## Properties

### \_meta? \{#_meta\}

```ts
_meta?: object;
```

Defined in: [types.ts:354](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L354)

Additional diagnostic information; present only when there is something to report.

#### encryptedFields?

```ts
encryptedFields?: string[];
```

Field names masked in this result.

#### errorCode?

```ts
errorCode?: 
  | "ENTITY_NOT_FOUND"
  | "ENTITY_AMBIGUOUS"
  | "RXDB_NOT_READY"
  | "KEYRING_LOCKED";
```

Structured error code, letting the panel branch without matching message text.

The type narrows to [DevToolsEntityErrorCode](../type-aliases/DevToolsEntityErrorCode.md), but
runtime validation stays lenient — the panel may connect to a connector newer than itself, and
unknown codes must be able to land safely.

***

### data \{#data\}

```ts
data: unknown[];
```

Defined in: [types.ts:352](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L352)

The list of documents, serialized and masked; an empty array on failure.

***

### entityName \{#entityname\}

```ts
entityName: string;
```

Defined in: [types.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L346)

Echoes the entity name of the request so the panel can match the response back to the request.

***

### error \{#error\}

```ts
error: string | null;
```

Defined in: [types.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L350)

A human-readable description when the query fails; `null` on success.

***

### namespace? \{#namespace\}

```ts
namespace?: string;
```

Defined in: [types.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L348)

Echoes the namespace from the request; omitted when an older client did not send one.
