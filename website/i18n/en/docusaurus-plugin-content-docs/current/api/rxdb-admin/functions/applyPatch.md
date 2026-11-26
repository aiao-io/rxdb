# applyPatch()

```ts
function applyPatch<T>(current, patch): T;
```

Defined in: [preferences/merge.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/merge.ts#L42)

Deep-merges a patch: objects are recursed into, arrays and leaves are replaced wholesale, `undefined` is ignored, and `null` is a valid value.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `current` | `T`       | The current value. |
| `patch`   | `unknown` | The patch.         |

## Returns

`T`

The new value; inputs are not mutated.
