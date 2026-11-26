# AdminShellProvider()

```ts
function AdminShellProvider(props): ReactElement;
```

Defined in: [context.tsx:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/context.tsx#L28)

Provides the shell to the subtree and binds the shell to the browser during mount (shortcuts, theme, layout variables, title).
To avoid first-screen flicker, call `shell.attach()` before the first render; `attach` is idempotent.

## Parameters

| Parameter | Type                                                                  | Description                |
| --------- | --------------------------------------------------------------------- | -------------------------- |
| `props`   | [`AdminShellProviderProps`](../interfaces/AdminShellProviderProps.md) | The shell and the subtree. |

## Returns

`ReactElement`

The Provider element.
