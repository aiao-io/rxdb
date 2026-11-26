# extensionDefaults()

```ts
function extensionDefaults(extensions): Record<string, unknown>;
```

Defined in: [preferences/schema/extension.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/extension.ts#L98)

Aggregates the extension defaults.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `extensions` | readonly [`PreferenceExtension`](../interfaces/PreferenceExtension.md)[] | The extension declarations. |

## Returns

`Record`&lt;`string`, `unknown`&gt;

A record of defaults keyed by extension key.
