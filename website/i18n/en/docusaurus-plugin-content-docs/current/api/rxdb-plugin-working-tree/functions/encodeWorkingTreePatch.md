# encodeWorkingTreePatch()

```ts
function encodeWorkingTreePatch(context, target, patch): Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L121)

Encodes a patch into the shape that can be persisted in the `patch` / `inversePatch` json columns.

## Parameters

| Parameter | Type                                                                            | Description                                                            |
| --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `context` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | The metadata resolution context                                        |
| `target`  | [`WorkingTreePatchTarget`](../interfaces/WorkingTreePatchTarget.md)             | The `namespace` / `entity` columns of the row                          |
| `patch`   | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; \| `null` \| `undefined`  | The field-level changes; `null` / `undefined` are normalized to `null` |

## Returns

`Record`&lt;`string`, `unknown`&gt; \| `null`

The encoded result after a shallow copy; the input is not mutated

## Throws

[UnknownWorkingTreePatchEntityError](../classes/UnknownWorkingTreePatchEntityError.md) when the target entity is not registered in this process

## Remarks

All the actual encoding is done by [encodeRxDBChangePatch](../../rxdb/functions/encodeRxDBChangePatch.md), including the rule "columns with `encrypted: true` are always skipped" — the encryption package carries its own envelope, and wrapping another one would make the read side decode a blob of bytes without erroring.
