# parseCron()

```ts
function parseCron(expression): CronParts;
```

Defined in: [packages/utils/src/cron/describeCron.ts:298](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/cron/describeCron.ts#L298)

Parses a cron expression and returns its fields

Supports the standard 5-segment format (minute hour day month dow) and the 6-segment format (second minute hour day month dow).

Every field is validated for **syntax and range**:

- Grammar: `field := '*' | item (',' item)*`, `item := ('*' | n | n '-' n) ['/' step]`, `step ≥ 1`; a range's start must not exceed its end; `*` cannot be combined with other items.
- Ranges: seconds `0-59`, minutes `0-59`, hours `0-23`, day `1-31`, month `1-12`, day-of-week `0-7` (0 and 7 are both Sunday).

## Parameters

| Parameter    | Type     | Description            |
| ------------ | -------- | ---------------------- |
| `expression` | `string` | Cron expression string |

## Returns

[`CronParts`](../interfaces/CronParts.md)

The parsed field object (each segment's string is kept verbatim)

## Throws

`Error` when the number of segments is not 5 or 6, or any field has invalid syntax / out-of-range values

## Examples

```ts
parseCron('0 9 * * 1-5');
// `{ minute: '0', hour: '9', day: '*', month: '*', dow: '1-5' }`
```

```ts
parseCron('0 0 1 13 *'); // throws: the month field "13" (value 13) is outside the range 1-12
```
