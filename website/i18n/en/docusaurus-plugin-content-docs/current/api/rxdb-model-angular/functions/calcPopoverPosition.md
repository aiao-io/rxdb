# calcPopoverPosition()

```ts
function calcPopoverPosition(
   triggerRect, 
   gap?, 
   minSpaceBelow?
): object;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/popover-position.d.ts:9

Calculates the position of the popover relative to the trigger element, preferring to show it below and flipping upward when space is insufficient.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `triggerRect` | `DOMRect` | The DOMRect of the trigger button |
| `gap?` | `number` | The spacing between the trigger element and the popover (in px, default 2) |
| `minSpaceBelow?` | `number` | The threshold for judging whether the space below is sufficient (in px, default 120) |

## Returns

`object`

The popover positioning info: left, minWidth, and top (shown below) or bottom (shown above)

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
