# DesktopSqliteClientOptions

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:54

Optional behavior parameters for [DesktopSqliteClient.connect](../classes/DesktopSqliteClient.md#connect).

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
readonly batchTimeout?: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:61

Debounce window for change events (milliseconds); the host's default `DEFAULT_BATCH_TIMEOUT` applies when omitted.

#### Remarks

Same meaning as the wasm client's option of the same name, except batching happens on the host side
— the merge completes before events cross processes.
