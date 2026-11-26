# envelopePlaintextPatches

```ts
const envelopePlaintextPatches: (args) => Promise<Record<string, unknown>>;
```

Defined in: packages/rxdb-adapter-encrypted/dist/encrypt-patch.d.ts:14

Iterates the top-level keys of a plaintext patch; for keys present in `entity.encryptedPropertyMap`,
replaces the value with the envelope string produced by `keyring.encrypt`. Unencrypted keys are copied as-is.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`PatchWalkArgs`](../../rxdb-adapter-encrypted/interfaces/PatchWalkArgs.md) |

## Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;
