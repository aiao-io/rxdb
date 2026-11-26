# describeCron()

```ts
function describeCron(expression): string;
```

Defined in: [packages/utils/src/cron/describeCron.ts:329](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/cron/describeCron.ts#L329)

Translates a cron expression into a Chinese natural-language description

Supports the standard 5-segment format (minute hour day month dow) and the 6-segment format (second minute hour day month dow). Field syntax and ranges are documented in [parseCron](parseCron.md).

## Parameters

| Parameter    | Type     | Description            |
| ------------ | -------- | ---------------------- |
| `expression` | `string` | Cron expression string |

## Returns

`string`

The Chinese description

## Throws

`Error` when the expression is invalid; invalid input no longer degrades into a fake description — callers using it for UI display must catch it themselves (UTL-024)

## Example

```ts
describeCron('* * * * *'); // 'runs every minute of every day'
describeCron('0 9 * * 1-5'); // 'runs at 09:00 on every weekday'
describeCron('0 0 1 1 *'); // 'runs at 00:00 on January 1'
describeCron('30 18 * * 5'); // 'runs at 18:30 every Friday'
```
