# isValidDueDate()

```ts
function isValidDueDate(value): boolean;
```

Defined in: [packages/rxdb-plugin-board/src/title.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/title.ts#L23)

`YYYY-MM-DD` and a valid Gregorian date (2024-02-29 valid, 2026-02-29 / 2026-13-01 invalid).
Pure arithmetic implementation: dates are not parsed into UTC instants, so there is no drift across timezones (US-536 AC#13).

## Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

## Returns

`boolean`
