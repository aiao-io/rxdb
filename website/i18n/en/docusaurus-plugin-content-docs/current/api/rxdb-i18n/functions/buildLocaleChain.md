# buildLocaleChain()

```ts
function buildLocaleChain(preferences): string[];
```

Defined in: [locale.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/locale.ts#L33)

Each node tries the exact match first and then the parent language, finally deduplicated in order of first appearance.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `preferences` | [`LocalePreferences`](../interfaces/LocalePreferences.md) |

## Returns

`string`[]