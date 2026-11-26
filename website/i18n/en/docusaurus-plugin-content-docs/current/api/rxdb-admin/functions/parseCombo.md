# parseCombo()

```ts
function parseCombo(combo): ParsedCombo;
```

Defined in: [shortcuts/combo.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L72)

Parses key combo text such as `Mod+K`, `Alt+Shift+L`, `Mod+,`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `combo` | `string` | Modifiers joined to a main key with `+`; write `Plus` when the main key is the plus sign. |

## Returns

[`ParsedCombo`](../interfaces/ParsedCombo.md)

The parse result.

## Throws

Throws when the main key is missing, the main key is not unique, or the text is empty.
