# computeThemeStyle()

```ts
function computeThemeStyle(prefs): Record<string, string>;
```

Defined in: [theme/style.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/style.ts#L40)

Computes the overrides to write to the root node's `style` (custom properties or plain CSS property names).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `prefs` | [`AdminPreferences`](../interfaces/AdminPreferences.md) | The preferences. |

## Returns

`Record`&lt;`string`, `string`&gt;

Property name to value; entries whose preference is "follow theme" are omitted.
