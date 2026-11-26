# buildPropertyColumn()

```ts
function buildPropertyColumn(config): ColumnDefine;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:118

Builds a VTable ColumnDefine based on the property type configuration

Handles all 11 PropertyTypes:

- uuid / string / number / integer → text display + input-editor (when not readonly)
- enum → text display + list-editor dropdown (when not readonly)
- boolean → switch cellType
- date → local time formatting + date-editor datetime picker (when not readonly)
- stringArray → comma-separated display + tags-editor tag input (when not readonly)
- numberArray → comma-separated display + number-tags-editor numeric tag input (when not readonly)
- keyValue → JSON string display + key-value-editor key-value pair editor (when not readonly)
- json → JSON string display + json-editor text area (when not readonly)

## Parameters

| Parameter | Type                                                            | Description                   |
| --------- | --------------------------------------------------------------- | ----------------------------- |
| `config`  | [`PropertyColumnConfig`](../interfaces/PropertyColumnConfig.md) | Property column configuration |

## Returns

`ColumnDefine`

The built VTable ColumnDefine
