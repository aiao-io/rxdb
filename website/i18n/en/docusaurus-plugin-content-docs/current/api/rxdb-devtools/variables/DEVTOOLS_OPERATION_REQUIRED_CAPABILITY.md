# DEVTOOLS_OPERATION_REQUIRED_CAPABILITY

```ts
const DEVTOOLS_OPERATION_REQUIRED_CAPABILITY: object;
```

Defined in: [v2/authorization.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L70)

Minimum tier required for each operation.

## Type Declaration

### database \{#database\}

```ts
readonly database: object;
```

#### database.create-branch

```ts
readonly "create-branch": "full" = 'full';
```

#### database.delete-branch

```ts
readonly "delete-branch": "full" = 'full';
```

#### database.events

```ts
readonly events: "readonly" = 'readonly';
```

#### database.get-branches

```ts
readonly "get-branches": "readonly" = 'readonly';
```

#### database.inspect

```ts
readonly inspect: "readonly" = 'readonly';
```

#### database.query

```ts
readonly query: "readonly" = 'readonly';
```

#### database.switch-branch

```ts
readonly "switch-branch": "full" = 'full';
```

### files \{#files\}

```ts
readonly files: object;
```

#### files.create-directory

```ts
readonly "create-directory": "full" = 'full';
```

#### files.delete

```ts
readonly delete: "full" = 'full';
```

#### files.download

```ts
readonly download: "readonly" = 'readonly';
```

#### files.list

```ts
readonly list: "readonly" = 'readonly';
```

#### files.upload

```ts
readonly upload: "full" = 'full';
```

### settings \{#settings\}

```ts
readonly settings: object;
```

#### settings.clear

```ts
readonly clear: "full" = 'full';
```

#### settings.export

```ts
readonly export: "readonly" = 'readonly';
```

## Remarks

The `full` tier is exactly the set that "changes persistent state", so [isMutatingOperation](../functions/isMutatingOperation.md) is derived directly from this table
rather than maintaining a separate write-operation list — two lists that must stay in sync will eventually drift, and the symptom of drift is a write
operation silently bypassing `mutationPolicy`.

`settings.export` stays at `readonly`: it touches no state and currently always returns `export_unsupported`.
