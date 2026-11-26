# calcPopoverPosition()

```ts
function calcPopoverPosition(
   triggerRect, 
   gap?, 
   minSpaceBelow?
): object;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/popover-position.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/popover-position.ts#L9)

Calculates the popover position relative to the trigger element, preferring to show below and flipping upward when space is insufficient.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `triggerRect` | `DOMRect` | `undefined` | DOMRect of the trigger button |
| `gap?` | `number` | `2` | Spacing between the trigger element and the popover (px, default 2) |
| `minSpaceBelow?` | `number` | `120` | Threshold for judging whether the space below is sufficient (px, default 120) |

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
