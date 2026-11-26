# DevToolsProviderDescriptor

Defined in: [provider/descriptor.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L84)

The provider descriptor; at most one per domain.

## Properties

### domain \{#domain\}

```ts
readonly domain: "database" | "files" | "settings";
```

Defined in: [provider/descriptor.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L85)

***

### kind \{#kind\}

```ts
readonly kind: "rxdb" | "unavailable" | "opfs" | "native-files" | "idb" | "sqlite";
```

Defined in: [provider/descriptor.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L88)

***

### limits \{#limits\}

```ts
readonly limits: DevToolsProviderLimits;
```

Defined in: [provider/descriptor.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L92)

***

### operations \{#operations\}

```ts
readonly operations: readonly (
  | "inspect"
  | "query"
  | "events"
  | "get-branches"
  | "switch-branch"
  | "create-branch"
  | "delete-branch"
  | "list"
  | "download"
  | "upload"
  | "create-directory"
  | "delete"
  | "clear"
  | "export")[];
```

Defined in: [provider/descriptor.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L90)

An ordered subset in the order defined by the protocol; must be empty when `unavailable`.

***

### reason? \{#reason\}

```ts
readonly reason?: 
  | "not_configured"
  | "permission_denied"
  | "runtime_unsupported"
  | "initialization_failed";
```

Defined in: [provider/descriptor.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L94)

Present and required only when `kind === 'unavailable'`.

***

### runtime \{#runtime\}

```ts
readonly runtime: "browser" | "electron" | "tauri";
```

Defined in: [provider/descriptor.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L91)

***

### version \{#version\}

```ts
readonly version: 1;
```

Defined in: [provider/descriptor.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L87)

The descriptor schema version, fixed at 1.
