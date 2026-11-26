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

Defined in: packages/rxdb-model/dist/entity-value.utils.d.ts:24

Strictly parses form input; on failure it returns a structured reason and the caller must not overwrite the original input.

## Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `type`    | `string`                                  |
| `raw`     | `unknown`                                 |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md) |

## Returns

\| \{
`ok`: `true`;
`value`: `unknown`;
\}
\| \{
`message`: `string`;
`ok`: `false`;
\}
