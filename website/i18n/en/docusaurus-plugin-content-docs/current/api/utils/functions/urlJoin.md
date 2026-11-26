# urlJoin()

```ts
function urlJoin(...paths): string;
```

Defined in: [packages/utils/src/string/urlJoin.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/urlJoin.ts#L199)

Joins URL / path segments

The first segment determines the prefix (scheme, protocol-relative, root path); the remaining segments are stack-normalized: `.` is skipped, `..` pops the previous segment; `..` past the root (`/`, `//`, `scheme://host`) is dropped, everything else is kept verbatim.

The query string (from `?` onward) in any segment is moved after all path segments and does not participate in path normalization. The seam between the query string and the path is modified in only three places:

- Multi-segment merge: the first segment is kept as-is; later segments starting with `?` are joined with `&` (an empty segment containing only `?` contributes nothing), and segments starting with `&` / `#` are appended verbatim;
- The path/query seam: a trailing `/` from the prefix is not kept before `?` (`'http://x.com/'` + `'?a=1'` yields `'http://x.com?a=1'`);
- The path part: a `/` immediately before `&` or `#` (except `#!`) is collapsed, so the anchor hugs the previous segment.

Everything else is kept verbatim, including `.` / `..` / `/` inside query fragments and anchors (including trailing `/`), literal `?` / `&` / `#`, and already-encoded characters: `'?next=/a/../b'`, `'?next=/a/&b'`, `'?r=/s?q=1'`, `'#/route/'` are all unchanged.

## Parameters

| Parameter  | Type                     | Description                        |
| ---------- | ------------------------ | ---------------------------------- |
| ...`paths` | (`string` \| `number`)[] | Segments; must be string or number |

## Returns

`string`

The joined URL / path

## Throws

when a segment is not a string or number

## Example

```ts
urlJoin('http://x.com/', 'foo/bar', '?a=1'); // 'http://x.com/foo/bar?a=1'
urlJoin('http://x.com/a?x=1', 'b', '?y=2'); // 'http://x.com/a/b?x=1&y=2'
urlJoin('http://x.com', '?next=/a/&b', '?r=/s?q=1'); // 'http://x.com?next=/a/&b&r=/s?q=1'
urlJoin('/a/b/c/d', '..', '..', 'e'); // '/a/b/e'
```
