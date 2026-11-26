# envelopePlaintextPatches()

```ts
function envelopePlaintextPatches(args): Promise<Record<string, unknown>>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts#L23)

Walks the top-level keys of a plaintext patch; for keys present in `entity.encryptedPropertyMap`,
replaces the value with the envelope string produced by `keyring.encrypt`. Unencrypted keys are copied directly.

## Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `args`    | [`PatchWalkArgs`](../interfaces/PatchWalkArgs.md) |

## Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;
