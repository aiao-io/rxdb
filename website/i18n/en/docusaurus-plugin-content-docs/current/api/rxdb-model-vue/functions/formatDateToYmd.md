# formatDateToYmd()

```ts
function formatDateToYmd(date): string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/date.d.ts:7

Formats a date into a YYYY-MM-DD string.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `date` | `string` \| `Date` \| `null` \| `undefined` | The date to format (a Date object or a parseable date string) |

## Returns

`string`

Date string in YYYY-MM-DD format; returns an empty string when the input is empty or cannot be parsed
