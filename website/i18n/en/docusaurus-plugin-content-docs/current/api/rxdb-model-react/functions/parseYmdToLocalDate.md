# parseYmdToLocalDate()

```ts
function parseYmdToLocalDate(ymd): Date | null;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/date.d.ts:15

Parses a YYYY-MM-DD string into a Date in the local timezone.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ymd` | `string` \| `null` \| `undefined` | The date string in YYYY-MM-DD format |

## Returns

`Date` \| `null`

A Date object at 00:00:00 of that day in the local timezone; returns null when the input is empty, the number of segments is not 3, any segment's parseInt result is NaN, or it is not a real calendar date (`2023-02-29`, `2024-04-31`, `2024-13-01`)
