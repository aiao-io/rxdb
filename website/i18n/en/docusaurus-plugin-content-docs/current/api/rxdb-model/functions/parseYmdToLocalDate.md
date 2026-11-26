# parseYmdToLocalDate()

```ts
function parseYmdToLocalDate(ymd): Date | null;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/date.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/date.ts#L24)

Parses a YYYY-MM-DD string into a Date in the local timezone.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ymd` | `string` \| `null` \| `undefined` | A date string in YYYY-MM-DD format |

## Returns

`Date` \| `null`

A Date object at 00:00:00 of that day in the local timezone; returns null when the input is empty, the segment count is not 3, any segment's parseInt result is NaN,
or the date is not a real calendar date (`2023-02-29`, `2024-04-31`, `2024-13-01`).
