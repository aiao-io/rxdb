# formatPassTime()

```ts
function formatPassTime(
   startDate, 
   endDate, 
   config?
): string;
```

Defined in: [packages/utils/src/date/formatPassTime.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/formatPassTime.ts#L10)

Formats elapsed time (e.g. "3 hours ago")

## Parameters

| Parameter | Type |
| ------ | ------ |
| `startDate` | `Date` |
| `endDate` | `Date` |
| `config?` | `ParseTimeConfig` \| `FormatPassFunction` |

## Returns

`string`
