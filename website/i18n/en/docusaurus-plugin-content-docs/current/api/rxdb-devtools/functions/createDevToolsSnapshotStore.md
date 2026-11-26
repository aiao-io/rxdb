# createDevToolsSnapshotStore()

```ts
function createDevToolsSnapshotStore(ports): DevToolsSnapshotStore;
```

Defined in: [provider/snapshot.ts:360](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L360)

Creates a session-level snapshot store.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports` | [`DevToolsSnapshotPorts`](../interfaces/DevToolsSnapshotPorts.md) | The clock and the materialization source. |

## Returns

[`DevToolsSnapshotStore`](../interfaces/DevToolsSnapshotStore.md)

A [DevToolsSnapshotStore](../interfaces/DevToolsSnapshotStore.md).
