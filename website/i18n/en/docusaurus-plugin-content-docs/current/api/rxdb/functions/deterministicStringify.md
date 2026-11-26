# deterministicStringify()

```ts
function deterministicStringify(val): string;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:277](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L277)

Deterministic JSON.stringify

By sorting the keys of objects, ensures that objects with the same content but different key orders generate the same cache key.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `val` | `unknown` |

## Returns

`string`

## Remarks

The output is used directly as query cache keys (`QueryManager.createTask`) and data fingerprints (`QueryCacheEngine.#computeDataFingerprint`), so **two semantically different inputs must never map to the same string** — that would be handing query A's results to query B.

All values for which `JSON.stringify` returns `undefined` (top-level undefined, array-element undefined, functions, symbols) must be explicitly encoded; otherwise they get concatenated as bare `undefined` or swallowed into an empty string by `Array.join` (`[undefined]` and `[]` once got the same key for this reason). "Unique encoding" is chosen over "rejecting": the fingerprint path runs over user entity instances, arrow functions as class fields are own properties, and throwing would break live queries.

Functions are encoded by source and symbols by description, both on a best-effort basis — two closures with the same source still share a key, but they cannot be distinguished as query conditions anyway.

Keys whose value is `undefined` inside objects are still skipped (`{a: undefined}` ≡ `{}`), consistent with JSON semantics — which is exactly why `{limit: undefined}` should equal `{}`.
