# Header()

```ts
function Header(props): 
  | ReactElement<unknown, string | JSXElementConstructor<any>>
  | null;
```

Defined in: [layout/header.tsx:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/header.tsx#L147)

Header: menu toggle, brand (in header layout), horizontal menu, breadcrumb, and widgets.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `props` | [`HeaderProps`](../interfaces/HeaderProps.md) | Menu and extension slots. |

## Returns

  \| `ReactElement`&lt;`unknown`, `string` \| `JSXElementConstructor`&lt;`any`&gt;&gt;
  \| `null`

The header element; empty when content is maximized.
