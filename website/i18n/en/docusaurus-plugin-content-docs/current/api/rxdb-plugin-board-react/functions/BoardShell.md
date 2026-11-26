# BoardShell()

```ts
function BoardShell(__namedParameters): ReactNode;
```

Defined in: [packages/rxdb-plugin-board-react/src/board-shell.tsx:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/board-shell.tsx#L195)

Board shell (US-537 / US-539 AC#4 / #5): startup choice (create an empty board / load demo data / restore from backup), preparing and restoring states, toolbar (reset to demo data / restore from backup) and in-app confirmation; the board phase embeds [BoardView](BoardView.md).

## Parameters

| Parameter           | Type                                                  |
| ------------------- | ----------------------------------------------------- |
| `__namedParameters` | [`BoardShellProps`](../interfaces/BoardShellProps.md) |

## Returns

`ReactNode`

## Remarks

All orchestration lives in the core package's `BoardShellController` (active location, reloading the whole page to read back after restoring to a new database name, cross-page restoring state and reload on database switch); the component only renders its state and forwards user actions. Same functionality and same DOM contract (class names + data-testid) as Angular's `BoardShellComponent` and Vue's `BoardShell`. Styles are delivered via the `./board-view.css` subpath; consumers import it at the entry point.
