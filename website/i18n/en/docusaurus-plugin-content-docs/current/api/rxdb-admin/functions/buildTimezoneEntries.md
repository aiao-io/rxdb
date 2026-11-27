# buildTimezoneEntries()

```ts
function buildTimezoneEntries(now): TimezoneEntry[];
```

Defined in: [widgets/timezone.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/timezone.ts#L136)

Computes the current offset for each commonly used time zone.

## Parameters

| Parameter | Type   | Description  |
| --------- | ------ | ------------ |
| `now`     | `Date` | The instant. |

## Returns

[`TimezoneEntry`](../interfaces/TimezoneEntry.md)[]

The time zone entries.
