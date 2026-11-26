# describeCronParts()

```ts
function describeCronParts(expression): CronPartsDescription;
```

Defined in: [packages/utils/src/cron/describeCron.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/cron/describeCron.ts#L356)

Translates each field of a cron expression into Chinese labels

Field syntax and ranges are documented in [parseCron](parseCron.md).

## Parameters

| Parameter    | Type     | Description            |
| ------------ | -------- | ---------------------- |
| `expression` | `string` | Cron expression string |

## Returns

[`CronPartsDescription`](../interfaces/CronPartsDescription.md)

The Chinese description of each field; a null value means the field is a wildcard; 5-segment expressions have no second

## Throws

`Error` when the expression is invalid

## Example

```ts
describeCronParts('0 9 * * 1-5');
// `{ minute: 'on the hour', hour: '9 o'clock', day: null, month: null, dow: 'Monday to Friday' }`
```
