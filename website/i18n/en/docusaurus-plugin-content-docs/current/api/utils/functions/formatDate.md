# formatDate()

```ts
function formatDate(timestamp?): string;
```

Defined in: [packages/utils/src/file/index.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/file/index.ts#L106)

Formats a timestamp as `zh-CN` "year-month-day hour:minute".

Uses the local time zone of the runtime, so the same timestamp renders differently in different time zones.
Invalid input **does not throw** and always degrades to `'-'`, making it convenient to render directly.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `timestamp?` | `string` \| `number` \| `Date` | A millisecond timestamp, a string parseable by `Date`, or a `Date` instance |

## Returns

`string`

A string like `'2026/08/07 12:30'`; returns `'-'` for `undefined` / `null` / empty string /
         or when no valid time can be parsed (`Invalid Date`)
