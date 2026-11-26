# normalizeKVSchemaEntryType()

```ts
function normalizeKVSchemaEntryType(type): "string" | "number" | "boolean" | "date" | "integer" | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:40

Normalizes an entity property type to a keyValue Schema value type

Only string / enum / uuid / number / integer / boolean / date map directly,
all other types return undefined.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | \| `"string"` \| `"number"` \| `"bigint"` \| `"boolean"` \| `"json"` \| `"date"` \| [`uuid`](../../rxdb/enumerations/PropertyType.md#uuid) \| [`string`](../../rxdb/enumerations/PropertyType.md#string) \| [`enum`](../../rxdb/enumerations/PropertyType.md#enum) \| [`number`](../../rxdb/enumerations/PropertyType.md#number) \| [`integer`](../../rxdb/enumerations/PropertyType.md#integer) \| [`bigint`](../../rxdb/enumerations/PropertyType.md#bigint) \| [`boolean`](../../rxdb/enumerations/PropertyType.md#boolean) \| [`date`](../../rxdb/enumerations/PropertyType.md#date) \| [`binary`](../../rxdb/enumerations/PropertyType.md#binary) \| [`stringArray`](../../rxdb/enumerations/PropertyType.md#stringarray) \| [`numberArray`](../../rxdb/enumerations/PropertyType.md#numberarray) \| [`keyValue`](../../rxdb/enumerations/PropertyType.md#keyvalue) \| [`json`](../../rxdb/enumerations/PropertyType.md#json) \| `"binary"` \| `"enum"` \| `"integer"` \| `"uuid"` \| `"numberArray"` \| `"stringArray"` \| `"keyValue"` | The entity property type (a PropertyType enum value) |

## Returns

`"string"` \| `"number"` \| `"boolean"` \| `"date"` \| `"integer"` \| `undefined`

The corresponding KVSchemaEntry value type; returns undefined when it cannot be mapped
