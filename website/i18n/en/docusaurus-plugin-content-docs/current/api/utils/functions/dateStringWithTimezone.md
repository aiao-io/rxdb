# dateStringWithTimezone()

```ts
function dateStringWithTimezone(
   date, 
   time, 
   offset
): string;
```

Defined in: [packages/utils/src/date/dateStringWithTimezone.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/dateStringWithTimezone.ts#L26)

UTC time conversion

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `date` | `string` | 2018-12-04 |
| `time` | `string` | 19:09:10 |
| `offset` | `number` | The minute amount of local time minus Greenwich Mean Time (GMT); the opposite of getTimezoneOffset |

## Returns

`string`

## Example

```ts
dateStringWithTimezone('2018-12-04', '19:09:10', 480) => '2018-12-04T19:09:10+08:00'
```
