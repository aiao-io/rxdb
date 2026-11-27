# buildPropertyColumn()

```ts
function buildPropertyColumn(config): ColumnDefine;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:118

Builds a VTable ColumnDefine based on the property type config

Handles all 11 PropertyType kinds:

- uuid / string / number / integer → text display + input-editor (when not readonly)
- enum → text display + list-editor dropdown (when not readonly)
- boolean → switch cellType
- date → local time formatting + date-editor datetime picker (when not readonly)
- stringArray → comma-separated display + tags-editor tag input (when not readonly)
- numberArray → comma-separated display + number-tags-editor number tag input (when not readonly)
- keyValue → JSON string display + key-value-editor key-value pair editor (when not readonly)
- json → JSON string display + json-editor text area (when not readonly)

## Parameters

| Parameter | Type                                                            | Description            |
| --------- | --------------------------------------------------------------- | ---------------------- |
| `config`  | [`PropertyColumnConfig`](../interfaces/PropertyColumnConfig.md) | Property column config |

## Returns

`ColumnDefine`

The built VTable ColumnDefine
