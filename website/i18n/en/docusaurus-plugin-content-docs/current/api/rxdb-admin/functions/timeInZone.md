# timeInZone()

```ts
function timeInZone(zone, date): string;
```

Defined in: [widgets/timezone.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/timezone.ts#L105)

The local time of the instant in the given time zone.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `zone` | `string` | The IANA name. |
| `date` | `Date` | The instant. |

## Returns

`string`

24-hour `HH:mm`.
