# traverseObjectKeys()

```ts
function traverseObjectKeys(value, callback, activeObjects?): void;
```

Defined in: [packages/utils/src/collection/traverseObjectKeys.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/collection/traverseObjectKeys.ts#L23)

Depth-first traversal of all own keys in a plain object

## Parameters

| Parameter        | Type                      | Description                                  |
| ---------------- | ------------------------- | -------------------------------------------- |
| `value`          | `unknown`                 | The object or array to traverse              |
| `callback`       | `Callback`                | Callback invoked for each object property    |
| `activeObjects?` | `WeakSet`&lt;`object`&gt; | Set of objects on the current recursion path |

## Returns

`void`
