# DEVTOOLS_PROVIDER_OPERATIONS

```ts
const DEVTOOLS_PROVIDER_OPERATIONS: object;
```

Defined in: [provider/descriptor.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L50)

Operations each domain may declare; **the order is the protocol definition order**.

## Type Declaration

### database \{#database\}

```ts
readonly database: readonly ["inspect", "query", "events", "get-branches", "switch-branch", "create-branch", "delete-branch"];
```

### files \{#files\}

```ts
readonly files: readonly ["list", "download", "upload", "create-directory", "delete"];
```

### settings \{#settings\}

```ts
readonly settings: readonly ["clear", "export"];
```

## Remarks

`operations` in a descriptor must be an ordered subset of this list. Order is required rather than "set equality suffices"
so that a descriptor has a unique canonical form: otherwise the same capability would have N! legal spellings,
and cross-platform fixture comparison and snapshot tests would falsely fail over write order.
