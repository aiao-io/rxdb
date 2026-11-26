# setWith()

```ts
function setWith<T>(object, path, value, customFun): T;
```

Defined in: [packages/utils/src/object/setWith.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/setWith.ts#L14)

Sets a nested path using a custom container factory.

## Type Parameters

| Type Parameter                                       |
| ---------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ `object` |

## Parameters

| Parameter   | Type                                           | Description                                                       |
| ----------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `object`    | `T`                                            | The object to modify                                              |
| `path`      | `string`                                       | Dot or bracket path                                               |
| `value`     | `unknown`                                      | The value to set                                                  |
| `customFun` | (`currentValue`, `key`, `object`) => `unknown` | Called when an intermediate path is missing or is not a container |

## Returns

`T`

The original object
