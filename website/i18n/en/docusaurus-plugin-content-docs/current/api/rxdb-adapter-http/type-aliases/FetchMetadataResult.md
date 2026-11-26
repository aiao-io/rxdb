# FetchMetadataResult

```ts
type FetchMetadataResult = 
  | QueryCacheEntityMetadata[]
  | {
  nextPageToken?: string;
  rows: QueryCacheEntityMetadata[];
};
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L90)

Single-page parse result, returned as a **discriminated** union of two shapes.

## Union Members

[`QueryCacheEntityMetadata`](../../rxdb/interfaces/QueryCacheEntityMetadata.md)[]

Shape 1 (`offset`): short-page termination (`rows.length < limit` means the last page)

***

### Type Literal

```ts
{
  nextPageToken?: string;
  rows: QueryCacheEntityMetadata[];
}
```

Shape 2 (`token`): token termination (`nextPageToken === undefined` means the last page)

## Remarks

The adapter locks the pagination mode of a query by the **first page's return shape**; switching shapes mid-query throws (`HttpPaginationError`, `reason: 'shape_switch'`) — mixing the two would let the termination criteria override each other, which is exactly the silent truncation this package exists to prevent.

The object shape's key is `nextPageToken`. Returning the pre-rename `nextCursor` is judged a contract error on the spot (`HttpHandlerContractError`) rather than read as `undefined`: the latter would mean "first page is the last page", leaving the whole table with only its first page and no error anywhere.
