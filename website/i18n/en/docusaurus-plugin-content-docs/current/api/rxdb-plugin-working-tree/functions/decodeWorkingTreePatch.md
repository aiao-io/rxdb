# decodeWorkingTreePatch()

```ts
function decodeWorkingTreePatch(
   context, 
   target, 
   patch
): Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L145)

The inverse of [encodeWorkingTreePatch](encodeWorkingTreePatch.md).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `context` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | The metadata resolution context |
| `target` | [`WorkingTreePatchTarget`](../interfaces/WorkingTreePatchTarget.md) | The `namespace` / `entity` columns on the row |
| `patch` | `unknown` | The value stored in the column; `null` / `undefined` are normalized to `null` |

## Returns

`Record`&lt;`string`, `unknown`&gt; \| `null`

The restored shallow copy; returned **as-is** when the target entity is not registered

## Throws

TypeError when the column does not hold a plain object (array / scalar / string)

## Remarks

The input is accepted as `unknown`: the value of this column comes from the database and may be corrupted by any path;
declaring it as `Record` would only push validation onto the caller, and callers usually do not validate either.
