# buildPropertyColumn()

```ts
function buildPropertyColumn(config): ColumnDefine;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:118

Builds a VTable ColumnDefine from the property type configuration

Handles all 11 PropertyTypes:
- uuid / string / number / integer → text display + input-editor (when not read-only)
- enum → text display + list-editor dropdown (when not read-only)
- boolean → switch cellType
- date → local time formatting + date-editor date-time picker (when not read-only)
- stringArray → comma-separated display + tags-editor tag input (when not read-only)
- numberArray → comma-separated display + number-tags-editor numeric tag input (when not read-only)
- keyValue → JSON string display + key-value-editor key-value pair editor (when not read-only)
- json → JSON string display + json-editor text area (when not read-only)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`PropertyColumnConfig`](../interfaces/PropertyColumnConfig.md) | Property column configuration |

## Returns

`ColumnDefine`

The built VTable ColumnDefine
