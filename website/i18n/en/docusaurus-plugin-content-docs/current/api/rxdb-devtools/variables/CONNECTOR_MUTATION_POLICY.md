# CONNECTOR_MUTATION_POLICY

```ts
const CONNECTOR_MUTATION_POLICY: DevToolsMutationPolicy = 'omit';
```

Defined in: [connector-providers.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L49)

Default write switch for the in-page connector.

## Remarks

Defaults to `'omit'`: `upload` / `create-directory` / `delete` in `files` are all `full`-tier write operations,
and "wiring up the provider" should not open the write path as a side effect. The owner must opt in to writes explicitly.
