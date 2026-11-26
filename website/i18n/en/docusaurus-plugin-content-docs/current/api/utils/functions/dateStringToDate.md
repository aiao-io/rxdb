# dateStringToDate()

```ts
function dateStringToDate(date, time, offset): Date;
```

Defined in: [packages/utils/src/date/dateStringToDate.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/dateStringToDate.ts#L9)

UTC time conversion

## Parameters

| Parameter | Type     | Description                    |
| --------- | -------- | ------------------------------ |
| `date`    | `string` | Date string, e.g. '2018-12-04' |
| `time`    | `string` | Time string, e.g. '19:09:10'   |
| `offset`  | `number` | Timezone offset in minutes     |

## Returns

`Date`
