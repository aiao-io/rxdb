# Breadcrumb()

```ts
function Breadcrumb(): ReactElement<unknown, string | JSXElementConstructor<any>> | null;
```

Defined in: [layout/header.tsx:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/header.tsx#L90)

Breadcrumb: the current page's path in the menu.

## Returns

\| `ReactElement`&lt;`unknown`, `string` \| `JSXElementConstructor`&lt;`any`&gt;&gt;
\| `null`

The breadcrumb element; empty when the preference turns it off, when there is only one level and hiding is requested, or when there is no match.
