# createDevToolsOpfsFilesProvider()

```ts
function createDevToolsOpfsFilesProvider(ports): DevToolsOpfsFilesProvider;
```

Defined in: [browser/opfs-files-provider.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L198)

Creates a `files` provider for browser OPFS.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports` | [`DevToolsOpfsFilesProviderPorts`](../interfaces/DevToolsOpfsFilesProviderPorts.md) | The OPFS root entry point, the transfer limit and the optional page save path. |

## Returns

[`DevToolsOpfsFilesProvider`](../interfaces/DevToolsOpfsFilesProvider.md)

A provider that can be installed directly into the `DevToolsProviderRegistry`.
