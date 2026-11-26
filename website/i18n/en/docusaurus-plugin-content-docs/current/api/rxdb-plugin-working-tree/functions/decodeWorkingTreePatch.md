# decodeWorkingTreePatch()

```ts
function decodeWorkingTreePatch(
   context, 
   target, 
   patch
): Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L145)

Inverse of [encodeWorkingTreePatch](encodeWorkingTreePatch.md).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `context` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | Metadata resolution context |
| `target` | [`WorkingTreePatchTarget`](../interfaces/WorkingTreePatchTarget.md) | The `namespace` / `entity` two columns on the row |
| `patch` | `unknown` | The value stored in the column; `null` / `undefined` normalize to `null` |

## Returns

`Record`&lt;`string`, `unknown`&gt; \| `null`

The restored shallow copy; returned **as-is** when the target entity is not registered

## Throws

TypeError what is stored in the column is not a plain object (array / scalar / string)

## Remarks

The input is taken as `unknown`: this column's value comes from the database and can be corrupted by any path;
declaring it as `Record` only pushes the validation onto the caller, and callers usually do not validate either.
