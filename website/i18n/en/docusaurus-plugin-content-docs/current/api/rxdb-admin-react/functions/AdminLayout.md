# AdminLayout()

```ts
function AdminLayout(props): ReactElement;
```

Defined in: [layout/admin-layout.tsx:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L46)

Admin shell layout: sidebar / header / tab bar / content area / footer, plus the preferences drawer, command palette, lock screen, and watermark.
Layout mode, sizes, and visibility are all driven by shell preferences; router-agnostic — the application only needs to pass the current URL and navigate in the `navigate` callback.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `props` | [`AdminLayoutProps`](../interfaces/AdminLayoutProps.md) | Menu, current URL, route outlet, and extension slots. |

## Returns

`ReactElement`

The shell element.
