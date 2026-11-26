# computeMinimalDocumentChange()

```ts
function computeMinimalDocumentChange(current, next): DocumentChangeSpec | null;
```

Defined in: [document-sync.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/document-sync.ts#L54)

Computes the minimal replacement range that turns `current` into `next`.

Skips the common prefix and common suffix and replaces only the segment that actually changed; returns `null` when the two are identical, letting the caller skip the transaction entirely.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `current` | `string` | The editor's current document content |
| `next` | `string` | The new content the host wants to write |

## Returns

[`DocumentChangeSpec`](../interfaces/DocumentChangeSpec.md) \| `null`

The minimal replacement range; `null` when nothing changed

## Remarks

Only prefix/suffix comparison, no line-by-line diff: the typical shapes of host write-back are "append a segment", "change a small block in the middle", and "reformat the whole document". Prefix/suffix already collapses the first two into a minimal range; and a whole-document reformat has no range worth keeping anyway. A complex diff brings larger implementation and performance risk while paying off only in very few scenarios.

Callers must also add `Transaction.addToHistory.of(false)` to the transaction — the minimal delta only solves the cursor problem and does **not** stop programmatic writes from entering the undo stack.

## Example

```ts
computeMinimalDocumentChange('hello world', 'hello brave world');
// `{ from: 6, to: 6, insert: 'brave ' }`
computeMinimalDocumentChange('same', 'same'); // null
```
