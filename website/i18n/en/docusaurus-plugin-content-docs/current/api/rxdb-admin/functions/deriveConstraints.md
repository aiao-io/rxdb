# deriveConstraints()

```ts
function deriveConstraints(items, themeNames): PreferenceConstraints;
```

Defined in: [preferences/schema/index.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/index.ts#L88)

Derives sanitization constraints from the preference items so that drawer inputs, imported files and local storage share the same value rules.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `items` | readonly [`PreferenceItem`](../interfaces/PreferenceItem.md)[] | The preference items (extensions excluded; extensions are handled by [sanitizeExtensions](sanitizeExtensions.md)). |
| `themeNames` | readonly `string`[] | The theme names the shell offers (excluding `system`). |

## Returns

[`PreferenceConstraints`](../type-aliases/PreferenceConstraints.md)

A map from path to constraints.
