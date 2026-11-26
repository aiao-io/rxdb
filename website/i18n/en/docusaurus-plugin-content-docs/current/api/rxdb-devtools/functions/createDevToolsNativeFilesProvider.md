# createDevToolsNativeFilesProvider()

```ts
function createDevToolsNativeFilesProvider(ports): DevToolsNativeFilesProvider;
```

Defined in: [native/native-files-provider.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L181)

Creates a `files` provider backed by the native filesystem.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports` | [`DevToolsNativeFilesProviderPorts`](../interfaces/DevToolsNativeFilesProviderPorts.md) | Host file capabilities, the real transfer limit and (optionally) the diagnostic snapshot port. |

## Returns

[`DevToolsNativeFilesProvider`](../interfaces/DevToolsNativeFilesProvider.md)

A provider that can be installed directly into the `DevToolsProviderRegistry`.
