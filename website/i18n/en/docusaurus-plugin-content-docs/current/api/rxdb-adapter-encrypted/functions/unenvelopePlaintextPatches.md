# unenvelopePlaintextPatches()

```ts
function unenvelopePlaintextPatches(args): Promise<Record<string, unknown>>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts#L51)

Inverse of `envelopePlaintextPatches`: decrypts top-level envelope strings back to plaintext.
Used when applying undo/redo `inversePatch`.

## Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `args`    | [`PatchWalkArgs`](../interfaces/PatchWalkArgs.md) |

## Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;
