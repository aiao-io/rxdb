# FetchRemoteOptions

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L100)

Remote fetch options.

`fetch()` uses it to cache a remote URL into OPFS and return the Blob in sync.

## Properties

### mimeType? \{#mimetype\}

```ts
mimeType?: string;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L109)

Force-overrides the MIME type of the returned Blob.

When not provided, fetch uses the response's `Content-Type` header (with
parameters like `; charset=...` automatically stripped); when both are missing
it throws [StorageMimeTypeMissingError](../classes/StorageMimeTypeMissingError.md)
and never falls back to `application/octet-stream`.

---

### signal? \{#signal\}

```ts
signal?: AbortSignal;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L111)

The AbortSignal passed through to the underlying fetch; throws `AbortError` when triggered.

---

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L102)

The remote resource URL, which must return a 2xx; a non-2xx throws [StorageFetchError](../classes/StorageFetchError.md).
