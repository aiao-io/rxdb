# assertSortOrderKey()

```ts
function assertSortOrderKey(entity, key): asserts key is string;
```

Defined in: [packages/rxdb/src/sortable/sortable.utils.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.utils.ts#L177)

Asserts that a user-written sort key is valid.

## Parameters

| Parameter | Type      | Description                                |
| --------- | --------- | ------------------------------------------ |
| `entity`  | `string`  | The entity name, used in the error message |
| `key`     | `unknown` | The key to validate                        |

## Returns

`asserts key is string`

## Throws

[SortOrderError](../classes/SortOrderError.md) with `reason` `'invalidKey'`: empty string, non-string, invalid format or not in the default alphabet
