# Brand()

```ts
function Brand(props): ReactElement<unknown, string | JSXElementConstructor<any>> | null;
```

Defined in: [layout/sidebar.tsx:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/sidebar.tsx#L28)

Brand area: logo image, icon, and app name; clicking goes home.

## Parameters

| Parameter | Type                                        | Description |
| --------- | ------------------------------------------- | ----------- |
| `props`   | [`BrandProps`](../interfaces/BrandProps.md) | The icon.   |

## Returns

\| `ReactElement`&lt;`unknown`, `string` \| `JSXElementConstructor`&lt;`any`&gt;&gt;
\| `null`

The brand element; empty when the preference turns the logo off.
