# DEVTOOLS_PROVIDER_KINDS

```ts
const DEVTOOLS_PROVIDER_KINDS: object;
```

Defined in: [provider/descriptor.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L32)

Semantic kinds allowed for each domain.

## Type Declaration

### database \{#database\}

```ts
readonly database: readonly ["rxdb", "unavailable"];
```

### files \{#files\}

```ts
readonly files: readonly ["opfs", "native-files", "unavailable"];
```

### settings \{#settings\}

```ts
readonly settings: readonly ["opfs", "idb", "sqlite", "unavailable"];
```
