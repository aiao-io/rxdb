# applyPopoverPosition()

```ts
function applyPopoverPosition(
   el, 
   triggerRect, 
   gap?, 
   minSpaceBelow?
): void;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/popover-position.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/popover-position.ts#L29)

Applies the result of calcPopoverPosition directly to the popover DOM element.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `el` | `HTMLElement` | `undefined` | The popover DOM element |
| `triggerRect` | `DOMRect` | `undefined` | The DOMRect of the trigger button |
| `gap?` | `number` | `2` | Spacing between the trigger element and the popover (in px, default 2) |
| `minSpaceBelow?` | `number` | `120` | Threshold for judging whether the space below is sufficient (in px, default 120) |

## Returns

`void`
