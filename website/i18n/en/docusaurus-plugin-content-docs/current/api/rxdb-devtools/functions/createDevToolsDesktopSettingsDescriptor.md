# createDevToolsDesktopSettingsDescriptor()

```ts
function createDevToolsDesktopSettingsDescriptor(runtime): DevToolsProviderDescriptor;
```

Defined in: [native/settings-provider.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/settings-provider.ts#L33)

Descriptor of the desktop settings provider.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `runtime` | `"browser"` \| `"electron"` \| `"tauri"` | Display-only host origin; enters only the descriptor, never any behavior branch. |

## Returns

[`DevToolsProviderDescriptor`](../interfaces/DevToolsProviderDescriptor.md)

The settings descriptor of this host.
