# pickThemes()

```ts
function pickThemes(names): ThemeOption[];
```

Defined in: [theme/themes.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/themes.ts#L63)

Picks themes from the shell catalog by name; daisyUI themes must be enabled by the application styles.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `names` | readonly `string`[] | Theme names; the order is the display order. |

## Returns

[`ThemeOption`](../interfaces/ThemeOption.md)[]

The theme options.

## Throws

Throws when a name is not in the catalog.
