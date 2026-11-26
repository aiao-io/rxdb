# normalizeKVSchemaEntryType()

```ts
function normalizeKVSchemaEntryType(type): "string" | "number" | "boolean" | "integer" | "date" | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:40

Normalizes an entity property type into a keyValue Schema value type

Only string / enum / uuid / number / integer / boolean / date can be mapped directly;
all other types return undefined.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | \| `"string"` \| `"number"` \| `"bigint"` \| `"boolean"` \| [`uuid`](../../rxdb/enumerations/PropertyType.md#uuid) \| [`string`](../../rxdb/enumerations/PropertyType.md#string) \| [`enum`](../../rxdb/enumerations/PropertyType.md#enum) \| [`number`](../../rxdb/enumerations/PropertyType.md#number) \| [`integer`](../../rxdb/enumerations/PropertyType.md#integer) \| [`bigint`](../../rxdb/enumerations/PropertyType.md#bigint) \| [`boolean`](../../rxdb/enumerations/PropertyType.md#boolean) \| [`date`](../../rxdb/enumerations/PropertyType.md#date) \| [`binary`](../../rxdb/enumerations/PropertyType.md#binary) \| [`stringArray`](../../rxdb/enumerations/PropertyType.md#stringarray) \| [`numberArray`](../../rxdb/enumerations/PropertyType.md#numberarray) \| [`keyValue`](../../rxdb/enumerations/PropertyType.md#keyvalue) \| [`json`](../../rxdb/enumerations/PropertyType.md#json) \| `"integer"` \| `"date"` \| `"binary"` \| `"enum"` \| `"uuid"` \| `"numberArray"` \| `"stringArray"` \| `"keyValue"` \| `"json"` | Entity property type (a PropertyType enum value) |

## Returns

`"string"` \| `"number"` \| `"boolean"` \| `"integer"` \| `"date"` \| `undefined`

The corresponding KVSchemaEntry value type; returns undefined when it cannot be mapped
