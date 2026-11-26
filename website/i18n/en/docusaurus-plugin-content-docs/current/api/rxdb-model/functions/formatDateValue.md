# formatDateValue()

```ts
function formatDateValue(v, i18n?): string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L120)

Formats a date value as a localized string.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `v` | `unknown` | The date value to format |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | An explicitly configured formatting runtime; the original date format is kept when omitted |

## Returns

`string`

A localized date string including hours, minutes, and seconds
