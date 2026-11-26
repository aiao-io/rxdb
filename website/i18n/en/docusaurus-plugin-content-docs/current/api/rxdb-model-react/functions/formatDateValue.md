# formatDateValue()

```ts
function formatDateValue(v, i18n?): string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:86

Formats a date value as a local string

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `v` | `unknown` | The date value to format |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | The explicitly configured formatting runtime; the original date format is kept when omitted |

## Returns

`string`

The localized date string including hours, minutes, and seconds
