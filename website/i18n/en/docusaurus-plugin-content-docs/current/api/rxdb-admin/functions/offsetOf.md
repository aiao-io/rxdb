# offsetOf()

```ts
function offsetOf(zone, date): string;
```

Defined in: [widgets/timezone.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/timezone.ts#L93)

The offset from UTC for a given instant in a given time zone (including daylight saving time).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `zone` | `string` | The IANA name. |
| `date` | `Date` | The instant. |

## Returns

`string`

In the form `GMT+8`, `GMT+5:30`, `GMT`; different ICU versions spell the zero offset inconsistently (`GMT` / `GMT+0`), so it is normalized to `GMT`.
