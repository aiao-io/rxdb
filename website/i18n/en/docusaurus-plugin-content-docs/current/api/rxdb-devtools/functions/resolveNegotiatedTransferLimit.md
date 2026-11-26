# resolveNegotiatedTransferLimit()

```ts
function resolveNegotiatedTransferLimit(limits): number | undefined;
```

Defined in: [provider/limits.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/limits.ts#L37)

Negotiates the transfer limit that actually takes effect.

## Parameters

| Parameter | Type      | Description                                                           |
| --------- | --------- | --------------------------------------------------------------------- |
| `limits`  | `unknown` | The limits declared by the panel / connector / provider respectively. |

## Returns

`number` \| `undefined`

The minimum when all are valid; `undefined` when the list is empty or contains an invalid entry.

## Remarks

If any side's declaration is invalid, the whole result is `undefined` and the caller translates it into `invalid_message`. It **does not skip invalid entries and continue with the minimum** — that would let a miswritten limit be silently ignored while the faulty side keeps working with its own (possibly larger) value.
