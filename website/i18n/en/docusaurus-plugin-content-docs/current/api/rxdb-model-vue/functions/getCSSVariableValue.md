# getCSSVariableValue()

```ts
function getCSSVariableValue(
   name, 
   fallback, 
   style?
): string;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:41

Reads a single CSS variable value, falling back to the default when empty

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | CSS variable name |
| `fallback` | `string` | Fallback value when the variable is missing or empty |
| `style?` | `Pick`&lt;`CSSStyleDeclaration`, `"getPropertyValue"`&gt; | The style source; defaults to the computed style of the document root element |

## Returns

`string`

The variable value (with leading and trailing whitespace removed); returns fallback when invalid or empty
