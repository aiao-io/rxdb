# omit()

```ts
function omit<T, Keys>(obj, keys): Omit<T, Keys>;
```

Defined in: [packages/utils/src/object/omit.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/omit.ts#L10)

Removes the given own properties from a shallow copy of an object

## Type Parameters

| Type Parameter                                                                     | Description                    |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ `object`                               | The input object's type        |
| <a id="type-parameter-keys"></a> `Keys` _extends_ `string` \| `number` \| `symbol` | The type of the keys to delete |

## Parameters

| Parameter | Type     | Description        |
| --------- | -------- | ------------------ |
| `obj`     | `T`      | Source object      |
| `keys`    | `Keys`[] | The keys to delete |

## Returns

`Omit`&lt;`T`, `Keys`&gt;

A new object with the properties removed
