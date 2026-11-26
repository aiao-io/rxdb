# interceptNavigation()

```ts
function interceptNavigation(event, go): void;
```

Defined in: [layout/menu-tree.tsx:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/menu-tree.tsx#L15)

Plain left clicks are taken over by the shell as SPA navigation; clicks with modifier keys or the middle button stay with the browser (open in a new tab).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `MouseEvent` | The click event. |
| `go` | () => `void` | The navigation action. |

## Returns

`void`
