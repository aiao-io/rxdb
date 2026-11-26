# parseTime()

```ts
function parseTime(startDate, endDate): ParseTime;
```

Defined in: [packages/utils/src/date/parseTime.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/parseTime.ts#L33)

Computes the time difference between two dates and breaks it into years, months, days, hours, minutes, and seconds

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `startDate` | `Date` | Start date |
| `endDate` | `Date` | End date |

## Returns

`ParseTime`

An object containing the broken-down time difference

## Example

```ts
const start = new Date('2023-01-01T00:00:00');
const end = new Date('2024-02-02T12:30:45');
const result = parseTime(start, end);
// returns: `{ year: 1, month: 13, day: 397, hour: 12, minute: 30, second: 45 }`
**Note:** month and year calculations are approximate (30 days = 1 month, 12 months = 1 year)
**Note:** all time units are integers rounded down
**Note:** the returned months and years may exceed the usual ranges (e.g. 13 months means 1 year and 1 month)
```
