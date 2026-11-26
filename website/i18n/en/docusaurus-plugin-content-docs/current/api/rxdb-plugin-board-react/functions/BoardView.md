# BoardView()

```ts
function BoardView(__namedParameters): ReactNode;
```

Defined in: [packages/rxdb-plugin-board-react/src/board-view.tsx:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/board-view.tsx#L106)

Board view component (board v2, GitHub Projects style): header + filter bar + columns / cards + overlay detail sidebar + root-level menus / selectors + modal dialogs + action toasts with undo.

## Parameters

| Parameter           | Type                                                |
| ------------------- | --------------------------------------------------- |
| `__namedParameters` | [`BoardViewProps`](../interfaces/BoardViewProps.md) |

## Returns

`ReactNode`

## Remarks

Actions are tucked into context menus, in-place edits save immediately (each change is one undoable transaction), and a single selector plus one filter syntax is used everywhere. All three bindings only capture pointer / keyboard events; drop targets, keyboard targets, filtering and popover positioning all call the same pure functions from the core package. Every write entry point goes through the domain actions of [useBoard](useBoard.md) (the write gate during restore and validation are re-checked in the service layer, not by hiding buttons). Styles come from `@aiao/rxdb-plugin-board/board.css` (inlined via this package's `./board-view.css` subpath; the library build extracts styles into a separate file and does not auto-inject them into the output, so consumers import that subpath at the entry point). The DOM contract (class names + data-testid) is identical to the Angular / Vue bindings.
