# set()

```ts
function set<T>(object, path, value): T;
```

Defined in: [packages/utils/src/object/set.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/set.ts#L57)

Sets a property value at the given path on an object, creating missing nested paths automatically.
When the next segment is a canonical array index (`0`, `12` — not `01` with a leading zero), it creates an array; otherwise an object.
Dangerous prototype-chain paths throw a TypeError.

## Type Parameters

| Type Parameter                                       |
| ---------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ `object` |

## Parameters

| Parameter | Type      | Description          |
| --------- | --------- | -------------------- |
| `object`  | `T`       | The object to modify |
| `path`    | `string`  | Dot or bracket path  |
| `value`   | `unknown` | The value to set     |

## Returns

`T`

The original object
