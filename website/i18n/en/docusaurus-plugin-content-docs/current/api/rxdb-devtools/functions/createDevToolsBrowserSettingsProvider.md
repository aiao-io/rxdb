# createDevToolsBrowserSettingsProvider()

```ts
function createDevToolsBrowserSettingsProvider(): DevToolsProvider;
```

Defined in: [browser/settings-provider.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/settings-provider.ts#L38)

Creates a browser `settings` provider.

## Returns

[`DevToolsProvider`](../interfaces/DevToolsProvider.md)

A provider that always returns `export_unsupported` for `export` and `provider_unsupported` for all other operations.
