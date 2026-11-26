# getDocumentRootStyle()

```ts
function getDocumentRootStyle(): Pick<CSSStyleDeclaration, "getPropertyValue"> | undefined;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-theme.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-theme.ts#L50)

Gets the computed style of the document root element

## Returns

`Pick`&lt;`CSSStyleDeclaration`, `"getPropertyValue"`&gt; \| `undefined`

The document root element's computed style; returns undefined in non-browser environments (no document)
