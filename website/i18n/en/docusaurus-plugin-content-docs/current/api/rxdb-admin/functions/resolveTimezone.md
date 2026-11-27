# resolveTimezone()

```ts
function resolveTimezone(preference): string;
```

Defined in: [widgets/timezone.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/timezone.ts#L74)

Resolves the timezone preference: an empty string means the browser timezone.

## Parameters

| Parameter    | Type     | Description           |
| ------------ | -------- | --------------------- |
| `preference` | `string` | The preference value. |

## Returns

`string`

The IANA name.
