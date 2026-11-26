# createTheme()

```ts
function createTheme(isDark, cssVars): TableTheme;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-theme.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-theme.ts#L168)

Builds a VTable theme based on daisyUI CSS variables.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `isDark` | `boolean` | Whether dark mode is active |
| `cssVars` | [`CSSVariables`](../interfaces/CSSVariables.md) | The set of theme CSS variables |

## Returns

`TableTheme`

The VTable theme object
