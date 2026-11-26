# Tabbar()

```ts
function Tabbar(): 
  | ReactElement<unknown, string | JSXElementConstructor<any>>
  | null;
```

Defined in: [tabbar/tabbar.tsx:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/tabbar/tabbar.tsx#L58)

Tab bar: multiple tabs, pinning, drag / keyboard reordering, context menu, middle-click close, wheel horizontal scrolling.

## Returns

  \| `ReactElement`&lt;`unknown`, `string` \| `JSXElementConstructor`&lt;`any`&gt;&gt;
  \| `null`

The tab bar element; empty when the preference turns it off or when there are no tabs yet.
