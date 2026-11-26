# Watermark()

```ts
function Watermark(): 
  | ReactElement<unknown, string | JSXElementConstructor<any>>
  | null;
```

Defined in: [watermark.tsx:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/watermark.tsx#L8)

Watermark: a tiled rotated-text overlay that intercepts no interaction.

## Returns

  \| `ReactElement`&lt;`unknown`, `string` \| `JSXElementConstructor`&lt;`any`&gt;&gt;
  \| `null`

The watermark element; empty when the preference turns it off or the text is empty.
