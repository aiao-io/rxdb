# getCSSVariableValue()

```ts
function getCSSVariableValue(
   name, 
   fallback, 
   style?
): string;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-theme.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-theme.ts#L66)

Reads a single CSS variable value, falling back to the default when empty

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | CSS variable name |
| `fallback` | `string` | Fallback value when the variable is missing or empty |
| `style?` | `Pick`&lt;`CSSStyleDeclaration`, `"getPropertyValue"`&gt; \| `undefined` | Style source, defaults to the computed style of the document root element |

## Returns

`string`

The variable value (with leading/trailing whitespace removed); returns the fallback when invalid or empty
