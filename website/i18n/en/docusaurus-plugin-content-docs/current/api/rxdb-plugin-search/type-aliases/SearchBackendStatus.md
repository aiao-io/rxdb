# SearchBackendStatus

```ts
type SearchBackendStatus = "supported" | "unverified";
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L32)

Registry status.

- `supported` — verified and allowed
- `unverified` — engine family matches, but this host environment could not be verified in this round; not allowed yet

Adapters whose engine family does not match (`http` / `supabase` / …) do not enter this registry: what they lack is not verification, but the local SQL connection itself.
