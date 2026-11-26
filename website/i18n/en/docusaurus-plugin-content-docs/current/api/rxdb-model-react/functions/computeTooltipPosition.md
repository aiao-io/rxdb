# computeTooltipPosition()

```ts
function computeTooltipPosition(container, rect): 
  | {
  x: number;
  y: number;
}
  | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-tooltip.d.ts:9

Computes the absolute position of a tooltip on the page

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `container` | `HTMLElement` \| `null` \| `undefined` | The container element the tooltip lives in |
| `rect` | `Record`&lt;`string`, `number`&gt; \| `null` \| `undefined` | The cell rectangle info (x/left, y/top, height/bottom) |

## Returns

  \| \{
  `x`: `number`;
  `y`: `number`;
\}
  \| `null`

Page coordinates (below the cell); returns null when the container, rectangle, or position info is missing
