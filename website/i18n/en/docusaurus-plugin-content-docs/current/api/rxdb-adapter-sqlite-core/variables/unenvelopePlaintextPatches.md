# unenvelopePlaintextPatches

```ts
const unenvelopePlaintextPatches: (args) => Promise<Record<string, unknown>>;
```

Defined in: packages/rxdb-adapter-encrypted/dist/encrypt-patch.d.ts:19

Inverse of `envelopePlaintextPatches`: decrypts top-level envelope strings back to plaintext.
Used when applying the `inversePatch` of undo/redo.

## Parameters

| Parameter | Type                                                                        |
| --------- | --------------------------------------------------------------------------- |
| `args`    | [`PatchWalkArgs`](../../rxdb-adapter-encrypted/interfaces/PatchWalkArgs.md) |

## Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;
