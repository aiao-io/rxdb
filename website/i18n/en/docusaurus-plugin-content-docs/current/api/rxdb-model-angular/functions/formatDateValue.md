# formatDateValue()

```ts
function formatDateValue(v, i18n?): string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:86

Formats a date value to a local string

## Parameters

| Parameter | Type                                      | Description                                                                                 |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `v`       | `unknown`                                 | The date value to format                                                                    |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md) | An explicitly configured formatting runtime; when omitted, the original date format is kept |

## Returns

`string`

A localized date string including hours, minutes and seconds
