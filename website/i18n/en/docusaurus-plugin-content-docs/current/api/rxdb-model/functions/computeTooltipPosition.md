# computeTooltipPosition()

```ts
function computeTooltipPosition(
  container,
  rect
): {
  x: number;
  y: number;
} | null;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts#L11)

Computes the tooltip's absolute position on the page.

## Parameters

| Parameter   | Type                                                        | Description                                            |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `container` | `HTMLElement` \| `null` \| `undefined`                      | The container element the tooltip belongs to           |
| `rect`      | `Record`&lt;`string`, `number`&gt; \| `null` \| `undefined` | The cell rectangle info (x/left, y/top, height/bottom) |

## Returns

\| \{
`x`: `number`;
`y`: `number`;
\}
\| `null`

Page coordinates (positioned below the cell); returns null when the container, rectangle, or position info is missing
