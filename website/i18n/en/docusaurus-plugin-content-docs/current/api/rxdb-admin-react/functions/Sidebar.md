# Sidebar()

```ts
function Sidebar(props): ReactElement<unknown, string | JSXElementConstructor<any>> | null;
```

Defined in: [layout/sidebar.tsx:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/sidebar.tsx#L121)

Sidebar: brand, menu tree, collapse button, width drag; expands on hover when collapsed, a drawer on mobile.

## Parameters

| Parameter | Type                                            | Description     |
| --------- | ----------------------------------------------- | --------------- |
| `props`   | [`SidebarProps`](../interfaces/SidebarProps.md) | Menu and brand. |

## Returns

\| `ReactElement`&lt;`unknown`, `string` \| `JSXElementConstructor`&lt;`any`&gt;&gt;
\| `null`

The sidebar element; empty when the layout doesn't need a sidebar.
