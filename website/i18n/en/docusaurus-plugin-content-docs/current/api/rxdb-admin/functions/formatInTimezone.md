# formatInTimezone()

```ts
function formatInTimezone(date, zone, options?, locale?): string;
```

Defined in: [widgets/timezone.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/timezone.ts#L122)

Formats a date in a time zone.

## Parameters

| Parameter  | Type                    | Description                                   |
| ---------- | ----------------------- | --------------------------------------------- |
| `date`     | `Date`                  | The instant.                                  |
| `zone`     | `string`                | The IANA name.                                |
| `options?` | `DateTimeFormatOptions` | `Intl.DateTimeFormat` options.                |
| `locale?`  | `string`                | The locale; defaults to the browser language. |

## Returns

`string`

The formatted text.
