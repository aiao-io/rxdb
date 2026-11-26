# applyPopoverPosition()

```ts
function applyPopoverPosition(el, triggerRect, gap?, minSpaceBelow?): void;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/popover-position.d.ts:23

Applies the result of calcPopoverPosition directly to the popover DOM element.

## Parameters

| Parameter        | Type          | Description                                                                         |
| ---------------- | ------------- | ----------------------------------------------------------------------------------- |
| `el`             | `HTMLElement` | The popover DOM element                                                             |
| `triggerRect`    | `DOMRect`     | The DOMRect of the trigger button                                                   |
| `gap?`           | `number`      | The gap between the trigger element and the popover (in px, default 2)              |
| `minSpaceBelow?` | `number`      | The threshold for deciding whether there is enough space below (in px, default 120) |

## Returns

`void`
