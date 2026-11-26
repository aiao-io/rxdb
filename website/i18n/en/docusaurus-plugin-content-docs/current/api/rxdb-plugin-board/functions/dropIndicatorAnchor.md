# dropIndicatorAnchor()

```ts
function dropIndicatorAnchor(target, visibleIds): 
  | {
  mode: "before" | "after";
  taskId: `${string}-${string}-${string}-${string}-${string}`;
}
  | null;
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L121)

Visible anchor for drop feedback: the insertion line is drawn after the visible previous neighbor; when that neighbor is filtered out, it is drawn before the visible next neighbor;
when neither side is visible or appending to an empty column, returns `null` (the caller falls back to highlighting the whole column).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`CardDropTarget`](../type-aliases/CardDropTarget.md) | - |
| `visibleIds` | readonly `` `${string}-${string}-${string}-${string}-${string}` ``[] | The ids of the cards currently visible in the target column |

## Returns

  \| \{
  `mode`: `"before"` \| `"after"`;
  `taskId`: `` `${string}-${string}-${string}-${string}-${string}` ``;
\}
  \| `null`

## Remarks

The drop neighbors come from the complete sequence (hidden siblings are never sandwiched between two neighbors), but the feedback can only be drawn on visible cards —
without a filter the result matches "after the previous neighbor / at the column head, before the next neighbor".
