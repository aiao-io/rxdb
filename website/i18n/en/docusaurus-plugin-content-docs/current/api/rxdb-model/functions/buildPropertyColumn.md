# buildPropertyColumn()

```ts
function buildPropertyColumn(config): ColumnDefine;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:241](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L241)

Builds a VTable ColumnDefine based on the property type configuration.

Handles all 11 PropertyType kinds:
- uuid / string / number / integer → text display + input-editor (when not read-only)
- enum → text display + list-editor dropdown (when not read-only)
- boolean → switch cellType
- date → local time formatting + date-editor datetime picker (when not read-only)
- stringArray → comma-separated display + tags-editor tag input (when not read-only)
- numberArray → comma-separated display + number-tags-editor numeric tag input (when not read-only)
- keyValue → JSON string display + key-value-editor key/value editor (when not read-only)
- json → JSON string display + json-editor text area (when not read-only)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`PropertyColumnConfig`](../interfaces/PropertyColumnConfig.md) | The property column configuration |

## Returns

`ColumnDefine`

The built VTable ColumnDefine
