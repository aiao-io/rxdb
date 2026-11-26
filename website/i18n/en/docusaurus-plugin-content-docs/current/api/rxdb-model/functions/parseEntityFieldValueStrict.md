# parseEntityFieldValueStrict()

```ts
function parseEntityFieldValueStrict(
   type, 
   raw, 
   i18n?
): 
  | {
  ok: true;
  value: unknown;
}
  | {
  message: string;
  ok: false;
};
```

Defined in: [packages/rxdb-model/src/entity-value.utils.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-value.utils.ts#L155)

Strictly parses form input; returns a structured reason on failure, and the caller must not overwrite the original input.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `string` |
| `raw` | `unknown` |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) |

## Returns

  \| \{
  `ok`: `true`;
  `value`: `unknown`;
\}
  \| \{
  `message`: `string`;
  `ok`: `false`;
\}
