# createDevToolsDesktopSettingsProvider()

```ts
function createDevToolsDesktopSettingsProvider(runtime): DevToolsProvider;
```

Defined in: [native/settings-provider.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/settings-provider.ts#L50)

Creates a desktop `settings` provider.

## Parameters

| Parameter | Type                                     | Description                                      |
| --------- | ---------------------------------------- | ------------------------------------------------ |
| `runtime` | `"browser"` \| `"electron"` \| `"tauri"` | Display-only host origin (`electron` / `tauri`). |

## Returns

[`DevToolsProvider`](../interfaces/DevToolsProvider.md)

A provider that always returns `export_unsupported` for `export` and `provider_unsupported` for all other operations.
