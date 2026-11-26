# DesktopHostOpenRequest

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:103

Opens a database session.

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
readonly batchTimeout?: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:113

Debounce window for change events (milliseconds), omitted to use the host's default.

#### Remarks

Same semantics as the wasm client's option of the same name. Batching lands on the host side rather than the renderer side:
merging happens before events cross processes, saving exactly the messages that would otherwise be moved across IPC one by one.

***

### kind \{#kind\}

```ts
readonly kind: "open";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:104

***

### storage \{#storage\}

```ts
readonly storage: DesktopSqliteFileStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:105
