# computeRootAttributes()

```ts
function computeRootAttributes(prefs, resolvedTheme): Record<string, string>;
```

Defined in: [theme/style.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/style.ts#L63)

Computes the attributes to write onto the root element: theme, grayscale / low-color mode, transition name, and compact density.

## Parameters

| Parameter       | Type                                                    | Description                       |
| --------------- | ------------------------------------------------------- | --------------------------------- |
| `prefs`         | [`AdminPreferences`](../interfaces/AdminPreferences.md) | The preferences.                  |
| `resolvedTheme` | `string`                                                | The resolved concrete theme name. |

## Returns

`Record`&lt;`string`, `string`&gt;

Attribute name to value; attributes that do not apply are omitted, and the application must remove them.
