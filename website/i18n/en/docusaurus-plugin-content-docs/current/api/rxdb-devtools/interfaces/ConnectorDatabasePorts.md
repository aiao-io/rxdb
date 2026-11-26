# ConnectorDatabasePorts

Defined in: [connector-providers.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L141)

The entry ports for the `database` domain; **all three are mandatory**.

## Remarks

Written as a single unit rather than three individually optional fields, so that "half-wired" does not exist at the type level:

- Without `getEntityMetadata` there is no way to know which fields are ciphertext, the masking table computes to an empty set, and query results and events push the ciphertext columns **as-is** to the panel;
- Without `emitEvent` an `events` subscription can be established but events have nowhere to go, and the panel keeps waiting for a frame that never comes.

Both cases must manifest as "this domain is not declared" rather than "declared but does one thing less".

## Properties

### emitEvent \{#emitevent\}

```ts
emitEvent: (eventType, data) => void;
```

Defined in: [connector-providers.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L147)

Pushes an already-masked RxDB event to the peer; usually wired to the v2 endpoint's `emitEvent`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `eventType` | `string` |
| `data` | `unknown` |

#### Returns

`void`

***

### getEntityMetadata \{#getentitymetadata\}

```ts
getEntityMetadata: GetEntityMetadataFn;
```

Defined in: [connector-providers.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L145)

The entity metadata reading function (usually `getEntityMetadata` from `@aiao/rxdb`).

***

### getRxDB \{#getrxdb\}

```ts
getRxDB: () => DevToolsRxDB | undefined;
```

Defined in: [connector-providers.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L143)

Gets the current RxDB instance; returning `undefined` means it has not been initialized yet (the operation answers `provider_unavailable`).

#### Returns

[`DevToolsRxDB`](../type-aliases/DevToolsRxDB.md) \| `undefined`
