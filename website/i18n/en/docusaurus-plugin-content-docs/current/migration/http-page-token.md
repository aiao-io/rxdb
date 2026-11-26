# HTTP adapter pagination key rename: `cursor` → `pageToken`

The pagination parameters of `@aiao/rxdb-adapter-http` were renamed: the `ctx.cursor` the handler receives is now `ctx.pageToken`, and the `{ rows, nextCursor }` returned from `parse` is now `{ rows, nextPageToken }`.

This is a **breaking change** affecting every handler that uses the cursor (token) pagination form. Integrations that only use the array form (short-page termination) are unaffected; `ctx.offset` / `ctx.limit` did not change.

## Why

"Cursor" was already taken in this repository by core: the cursor of [`findByCursor`](../model-query/findByCursor.md) is a keyset anchor made from an **entity instance** — it has fields, can be compared, and gets compiled into `where` rule groups inside the `Repository`; adapters never see it.

The HTTP adapter's cursor is a completely different thing: an **opaque continuation string** from the remote, on which the adapter only ever tests "equal / not equal / is `undefined`" and never parses the internal structure. With the two sharing a name, readers assume the latter can also be taken apart, and then write handlers like "filter by the timestamp inside the cursor" that only work by coincidence on one particular backend.

`pageToken` / `nextPageToken` contains no "cursor" as a whole word, and `token` itself says "opaque, don't take it apart".

## Change list

| Location                                    | Before                 | After                      |
| ------------------------------------------- | ---------------------- | -------------------------- |
| `FetchMetadataContext`                      | `cursor?: string`      | `pageToken?: string`       |
| `FetchMetadataResult` object form           | `{ rows, nextCursor }` | `{ rows, nextPageToken }`  |
| `HttpPaginationError.reason`                | `cursor_not_advancing` | `page_token_not_advancing` |
| Request body sent by `createRestHandlers()` | `{ …, cursor }`        | `{ …, pageToken }`         |

Exported type names, class names, and function names did not change; no `import` statements need updating.

## How to update

### Handwritten handlers

```typescript
// Before
onFetchMetadata: {
  request: ctx => ({
    url: `${ctx.entityName}/metadata`,
    method: 'POST',
    body: { where: ctx.where, limit: ctx.limit, cursor: ctx.cursor }
  }),
  parse: body => body as { rows: Metadata[]; nextCursor?: string }
}

// After
onFetchMetadata: {
  request: ctx => ({
    url: `${ctx.entityName}/metadata`,
    method: 'POST',
    body: { where: ctx.where, limit: ctx.limit, pageToken: ctx.pageToken }
  }),
  parse: body => body as { rows: Metadata[]; nextPageToken?: string }
}
```

A missed `ctx.cursor` in `request()` **fails to compile** (the property does not exist), so nothing can slip through.

The server-side field names do not have to change — `parse` is exactly the place where that mapping happens:

```typescript
parse: body => {
  const page = body as { rows: Metadata[]; next_cursor?: string };
  return { rows: page.rows, nextPageToken: page.next_cursor };
};
```

### Using `createRestHandlers()`

The request body key sent by the preset changed from `cursor` to `pageToken`, so **the server must change the field name it reads**. Otherwise the server receives no position parameter on any page, keeps returning the first page, pagination never advances, and eventually `maxPages` tops out and throws `HttpPaginationError` — whose message points at the page limit, not at this key.

The response is still determined by your `parse`; if the server returns `{ rows, nextCursor }`, see the next section.

### Matching `reason` in `catch`

```typescript
if (e instanceof HttpPaginationError && e.reason === 'page_token_not_advancing') { … }
```

`reason` is a string union type; writing the old value fails to compile.

## A leftover `nextCursor` throws; it is not treated as the last page

When `parse` returns `{ rows, nextCursor: 'x' }` without `nextPageToken`, the adapter throws `HttpHandlerContractError` and does **no compatibility reading**.

The strictness is deliberate: silently reading `undefined` would equal "first page is the last page", the whole table would be reduced to its first page, and the remaining ids would be judged **deleted on the remote** by the upper layer — combined with QueryCache's delete propagation, still-alive rows would be erased locally, all without a single error. That is exactly the kind of silent truncation this adapter defends against throughout, and a rename must not reintroduce it.

When both keys are present, `nextPageToken` wins and the response is not considered legacy: the handler already knows the new contract, and the extra `nextCursor` is just a remote field passed through unchanged.

## See also

- [HTTP adapter](../adapters/http.md)
- [`findByCursor`](../model-query/findByCursor.md): core's keyset cursor, a different concept unrelated to this page
