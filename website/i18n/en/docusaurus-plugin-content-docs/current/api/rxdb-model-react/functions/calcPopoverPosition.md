# calcPopoverPosition()

```ts
function calcPopoverPosition(
   triggerRect, 
   gap?, 
   minSpaceBelow?
): object;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/popover-position.d.ts:9

Calculates the popover position relative to the trigger element, preferring to show it below and flipping upward when there is not enough space.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `triggerRect` | `DOMRect` | The DOMRect of the trigger button |
| `gap?` | `number` | The gap between the trigger element and the popover (in px, default 2) |
| `minSpaceBelow?` | `number` | The threshold for deciding whether there is enough space below (in px, default 120) |

## Returns

`object`

Popover positioning info: left, minWidth, and top (shown below) or bottom (shown above)

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
