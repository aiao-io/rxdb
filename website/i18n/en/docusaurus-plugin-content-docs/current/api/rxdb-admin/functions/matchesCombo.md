# matchesCombo()

```ts
function matchesCombo(event, combo, platform): boolean;
```

Defined in: [shortcuts/combo.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L100)

Determines whether a keyboard event matches the combo; modifier keys must match exactly — extra modifiers do not match.

## Parameters

| Parameter  | Type                                                      | Description           |
| ---------- | --------------------------------------------------------- | --------------------- |
| `event`    | [`KeyEventLike`](../interfaces/KeyEventLike.md)           | The keyboard event.   |
| `combo`    | [`ParsedCombo`](../interfaces/ParsedCombo.md)             | The parsed combo.     |
| `platform` | [`ShortcutPlatform`](../type-aliases/ShortcutPlatform.md) | The running platform. |

## Returns

`boolean`

Returns `true` on a match.
