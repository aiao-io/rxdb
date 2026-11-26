# isDevToolsI18nSnapshot()

```ts
function isDevToolsI18nSnapshot(value): value is DevToolsI18nSnapshot;
```

Defined in: [i18n-port.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L77)

Validates an internationalization snapshot from the debug channel.

## Parameters

| Parameter | Type      | Description                       |
| --------- | --------- | --------------------------------- |
| `value`   | `unknown` | Untrusted response or event data. |

## Returns

`value is DevToolsI18nSnapshot`

`true` when all catalog and diagnostic row shapes are legal.
