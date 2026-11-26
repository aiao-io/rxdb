# isSupportedVersionList()

```ts
function isSupportedVersionList(value): value is number[];
```

Defined in: [v2/guards.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/guards.ts#L65)

Checks whether a value is a valid `PROTOCOL_HELLO.supportedVersions`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check. |

## Returns

`value is number[]`

`true` when the list is non-empty, strictly descending, of length ≤ 8, and every item is within 1–255.

## Remarks

It requires **strictly descending** rather than "descending + a separate deduplication": strict descending order guarantees both ordering and no duplicates in one step, eliminating an independent deduplication implementation that could disagree with the ordering check. The descending order itself is part of the protocol — version selection takes the first commonly supported item directly, and an out-of-order list would make the selection depend on the peer's writing order.
