# formatDateToYmd()

```ts
function formatDateToYmd(date): string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/date.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/date.ts#L7)

Formats a date as a YYYY-MM-DD string.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `date` | `string` \| `Date` \| `null` \| `undefined` | The date to format (a Date object or a parseable date string) |

## Returns

`string`

A date string in YYYY-MM-DD format; returns an empty string when the input is null or cannot be parsed
