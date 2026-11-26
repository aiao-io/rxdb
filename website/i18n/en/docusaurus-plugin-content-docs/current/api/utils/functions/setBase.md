# setBase()

```ts
function setBase<T>(
   object, 
   path, 
   value, 
   custom?
): T;
```

Defined in: [packages/utils/src/object/set.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/set.ts#L10)

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* `object` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `object` | `T` |
| `path` | `string` |
| `value` | `unknown` |
| `custom?` | `SetCustomizer` |

## Returns

`T`
