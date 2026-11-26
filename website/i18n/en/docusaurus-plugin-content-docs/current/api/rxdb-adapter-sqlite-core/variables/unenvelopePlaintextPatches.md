# unenvelopePlaintextPatches

```ts
const unenvelopePlaintextPatches: (args) => Promise<Record<string, unknown>>;
```

Defined in: packages/rxdb-adapter-encrypted/dist/encrypt-patch.d.ts:19

The inverse of `envelopePlaintextPatches`: decrypts top-level envelope strings back to plaintext.
Used when applying undo/redo `inversePatch`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`PatchWalkArgs`](../../rxdb-adapter-encrypted/interfaces/PatchWalkArgs.md) |

## Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;
