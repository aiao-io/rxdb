# createDevToolsNativeSnapshotSource()

```ts
function createDevToolsNativeSnapshotSource(ports): DevToolsSnapshotSource;
```

Defined in: [native/native-snapshot-source.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L117)

Creates a snapshot materialization source for the native host.

## Parameters

| Parameter | Type                                                                          | Description                                                  |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `ports`   | [`DevToolsNativeSnapshotPorts`](../interfaces/DevToolsNativeSnapshotPorts.md) | The exclusive lock, the epoch and the reads from both sides. |

## Returns

[`DevToolsSnapshotSource`](../interfaces/DevToolsSnapshotSource.md)

A source that can be handed to [@aiao/rxdb-devtools!createDevToolsSnapshotStore](createDevToolsSnapshotStore.md).
