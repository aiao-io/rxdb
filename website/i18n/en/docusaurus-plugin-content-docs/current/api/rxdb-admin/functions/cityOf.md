# cityOf()

```ts
function cityOf(zone): string;
```

Defined in: [widgets/timezone.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/timezone.ts#L83)

The city name: takes the last segment of the IANA name, underscores replaced with spaces.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `zone` | `string` | The IANA name. |

## Returns

`string`

The city name.
