# canonicalMaterializationJson()

```ts
function canonicalMaterializationJson(value): string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L192)

**`Internal`**

Folds a JSON value into a **key-order-independent** string — the canonical form shared by both ends of the materialization protocol.

## Parameters

| Parameter | Type      | Description                |
| --------- | --------- | -------------------------- |
| `value`   | `unknown` | Any JSON-expressible value |

## Returns

`string`

The same content always yields the same string

## Remarks

Plain `JSON.stringify` does not work: `{a:1,b:2}` and `{b:2,a:1}` are the same content, yet they serialize into two different strings, so a resume or drift decision would give two different answers depending on the literal order in which the object was written.

Kept in core rather than duplicated per side: the page fingerprint computed by the source side must match the one recomputed at the barrier byte-for-byte, and intents must be compared by the same measure on both ends — two separate normalizers would silently diverge the day either side is changed.
