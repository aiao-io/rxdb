# VersionHandler

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L209)

Protocol mapping for `version()`.

## Methods

### parse() \{#parse\}

```ts
parse(body): string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L212)

Parses the **remote server version**, consistent with the sqlite / pglite / supabase adapters

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `body`    | `unknown` |

#### Returns

`string`

---

### request() \{#request\}

```ts
request(): HttpRequestSpec;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L210)

#### Returns

[`HttpRequestSpec`](HttpRequestSpec.md)
