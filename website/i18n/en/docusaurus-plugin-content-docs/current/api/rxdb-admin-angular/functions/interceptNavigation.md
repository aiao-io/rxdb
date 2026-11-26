# interceptNavigation()

```ts
function interceptNavigation(event, go): void;
```

Defined in: [rxdb-admin-angular/src/layout/intercept-navigation.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/intercept-navigation.ts#L6)

A plain left click is taken over by the shell as SPA navigation; modified keys and the middle button are still handed to the browser (opening a new tab).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `MouseEvent` | Click event. |
| `go` | () => `void` | Navigation action. |

## Returns

`void`
