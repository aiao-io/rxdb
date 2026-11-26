# formatCombo()

```ts
function formatCombo(combo, platform): FormattedCombo;
```

Defined in: [shortcuts/combo.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L136)

Formats a key combo into key caps.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `combo` | [`ParsedCombo`](../interfaces/ParsedCombo.md) | The parsed key combo. |
| `platform` | [`ShortcutPlatform`](../type-aliases/ShortcutPlatform.md) | The running platform. |

## Returns

[`FormattedCombo`](../interfaces/FormattedCombo.md)

The list of key caps and the joined text.
