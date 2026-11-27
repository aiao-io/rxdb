# getDocumentRootStyle()

```ts
function getDocumentRootStyle(): Pick<CSSStyleDeclaration, 'getPropertyValue'> | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:32

Gets the computed style of the document root element

## Returns

`Pick`&lt;`CSSStyleDeclaration`, `"getPropertyValue"`&gt; \| `undefined`

The computed style of the document root element; returns undefined in non-browser environments (no document)
