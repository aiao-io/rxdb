# getDocumentRootStyle()

```ts
function getDocumentRootStyle(): Pick<CSSStyleDeclaration, 'getPropertyValue'> | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:32

Gets the document root element's computed style

## Returns

`Pick`&lt;`CSSStyleDeclaration`, `"getPropertyValue"`&gt; \| `undefined`

The document root element's computed style; returns undefined in non-browser environments (no document)
