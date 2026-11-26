# createDevToolsReadOnlySettingsProvider()

```ts
function createDevToolsReadOnlySettingsProvider(descriptor): DevToolsProvider;
```

Defined in: [provider/read-only-settings.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/read-only-settings.ts#L30)

Creates a read-only `settings` provider from the given descriptor.

## Parameters

| Parameter    | Type                                                                        | Description                                                                      |
| ------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `descriptor` | [`DevToolsProviderDescriptor`](../interfaces/DevToolsProviderDescriptor.md) | The settings descriptor of this side; `operations` should contain only `export`. |

## Returns

[`DevToolsProvider`](../interfaces/DevToolsProvider.md)

A provider that always returns `export_unsupported` for `export` and `provider_unsupported` for all other operations.
