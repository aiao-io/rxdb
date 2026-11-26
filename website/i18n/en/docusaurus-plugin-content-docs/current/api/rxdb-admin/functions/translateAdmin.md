# translateAdmin()

```ts
function translateAdmin(i18n, key, params?): string;
```

Defined in: [i18n/index.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/i18n/index.ts#L32)

Translates shell copy.

## Parameters

| Parameter | Type                                      | Description     |
| --------- | ----------------------------------------- | --------------- |
| `i18n`    | [`I18n`](../../rxdb-i18n/classes/I18n.md) | The runtime.    |
| `key`     | `string`                                  | The copy key.   |
| `params?` | `Record`&lt;`string`, `unknown`&gt;       | ICU parameters. |

## Returns

`string`

The translation; returns the key itself when the key is missing.
