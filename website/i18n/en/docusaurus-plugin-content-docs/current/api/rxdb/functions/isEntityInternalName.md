# isEntityInternalName()

```ts
function isEntityInternalName(key): boolean;
```

Defined in: [packages/rxdb/src/entity/entity.utils.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L30)

Determines whether a field name is an internal reserved field,
including base class fields, private fields and fields starting with an underscore.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The field name to check |

## Returns

`boolean`

Returns true if it is an internal reserved field, otherwise false
