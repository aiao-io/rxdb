# isRemoteNewer()

```ts
function isRemoteNewer(remoteUpdatedAt, localUpdatedAt, context): boolean;
```

Defined in: [packages/rxdb/src/repository/updated-at.utils.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/updated-at.utils.ts#L47)

Determines whether the remote record is newer than the local one.

## Parameters

| Parameter         | Type     | Description                          |
| ----------------- | -------- | ------------------------------------ |
| `remoteUpdatedAt` | `string` | The remote time string               |
| `localUpdatedAt`  | `string` | The local time string                |
| `context`         | `string` | The context used to locate the error |

## Returns

`boolean`

`true` when the remote is strictly newer

## Throws

TypeError when either side cannot be parsed into a point in time.

## Remarks

Must compare **points in time**, not string lexicographic order. Lexicographic order requires the two sides' formats to be exactly identical, but the actual sources are not:
the local side writes `.000Z`, Supabase gives a `+00:00` offset, and most HTTP backends give `Z` without milliseconds.
`'…:00Z' > '…:00.000Z'` is true lexicographically (`'Z'`'s code point is greater than `'.'`), so **the same instant**
is judged stale — every sync re-pulls everything, never converging. The reversed form (`local >= remote`) does the opposite,
judging fresh as stale, with the same symptoms.
