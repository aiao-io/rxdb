# calcPopoverPosition()

```ts
function calcPopoverPosition(triggerRect, gap?, minSpaceBelow?): object;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/popover-position.d.ts:9

Calculates the popover position relative to the trigger element, preferring below, and flipping upward when space is insufficient.

## Parameters

| Parameter        | Type      | Description                                                                 |
| ---------------- | --------- | --------------------------------------------------------------------------- |
| `triggerRect`    | `DOMRect` | The trigger button's DOMRect                                                |
| `gap?`           | `number`  | Spacing between the trigger element and the popover (px, default 2)         |
| `minSpaceBelow?` | `number`  | Threshold for judging whether there is enough space below (px, default 120) |

## Returns

`object`

Popover positioning info: left, minWidth, plus top (shown below) or bottom (shown above)

### bottom?

```ts
bottom?: number;
```

### left

```ts
left: number;
```

### minWidth

```ts
minWidth: number;
```

### top?

```ts
top?: number;
```
