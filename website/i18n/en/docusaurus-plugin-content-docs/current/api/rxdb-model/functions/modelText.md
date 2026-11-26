# modelText()

```ts
function modelText(
   key, 
   params?, 
   i18n?
): string;
```

Defined in: [packages/rxdb-model/src/i18n.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L27)

Reads the component catalog, with the configured catalog taking priority.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `key` | `string` | `undefined` |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | `undefined` |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | `defaultModelI18n` |

## Returns

`string`
