# createTheme()

```ts
function createTheme(isDark, cssVars): TableTheme;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:78

Builds a VTable theme based on daisyUI CSS variables

## Parameters

| Parameter | Type                                            | Description                    |
| --------- | ----------------------------------------------- | ------------------------------ |
| `isDark`  | `boolean`                                       | Whether it is dark mode        |
| `cssVars` | [`CSSVariables`](../interfaces/CSSVariables.md) | The set of theme CSS variables |

## Returns

`TableTheme`

The VTable theme object
