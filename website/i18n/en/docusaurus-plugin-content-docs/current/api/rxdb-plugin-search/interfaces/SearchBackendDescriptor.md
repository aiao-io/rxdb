# SearchBackendDescriptor

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L39)

Registry entry for a single adapter.

## Properties

### adapter \{#adapter\}

```ts
readonly adapter: string;
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L41)

adapter name, taken from the `ADAPTER_NAME` exported by each adapter package

***

### backend \{#backend\}

```ts
readonly backend: SearchBackendId;
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L43)

The backend corresponding to this adapter

***

### reason? \{#reason\}

```ts
readonly reason?: string;
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L47)

A distinguishable reason that must be given when `unverified`

***

### status \{#status\}

```ts
readonly status: SearchBackendStatus;
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L45)

Registry status
