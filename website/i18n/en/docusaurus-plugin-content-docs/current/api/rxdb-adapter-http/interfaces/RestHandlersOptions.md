# RestHandlersOptions

Defined in: [packages/rxdb-adapter-http/src/rest.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L44)

Configuration for [createRestHandlers](../functions/createRestHandlers.md).

## Properties

### resources? \{#resources\}

```ts
resources?: Record<string, string>;
```

Defined in: [packages/rxdb-adapter-http/src/rest.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L55)

Entity name → resource path segment, e.g. `{ Recipe: 'recipes' }`.

#### Remarks

Values **may contain `/`** (`v1/recipes` is legal): they come from configuration — constants written by the developer, not data. By contrast, the value of `:id` comes from remote rows and must be `encodeURIComponent`d — an id containing `/` would otherwise assemble the address of another resource. The two come from different sources, hence different treatment.

Entities not listed use their entity name itself as the path segment.

***

### templates? \{#templates\}

```ts
templates?: object;
```

Defined in: [packages/rxdb-adapter-http/src/rest.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L71)

Per-operation overrides of path and method.

#### create?

```ts
create?: RestOperationTemplate | null;
```

#### delete?

```ts
delete?: RestOperationTemplate | null;
```

#### fetchMetadata?

```ts
fetchMetadata?: RestOperationTemplate | null;
```

#### findByIds?

```ts
findByIds?: RestOperationTemplate | null;
```

#### isTableExisted?

```ts
isTableExisted?: RestOperationTemplate | null;
```

#### update?

```ts
update?: RestOperationTemplate | null;
```

#### version?

```ts
version?: RestOperationTemplate | null;
```

#### Remarks

The three possible values have different semantics: **absent** = use the default template (for `version` / `isTableExisted` the default is "not produced"); **an object** = use it; **`null`** = don't produce that handler.

`null` is a meaningful tier, not a redundant spelling: a write duck's "unsupported" manifests on core's side as **property absence** (`QueryCacheEngine` feature-detects with `if (!this.remoteAdapter.create)`), so a read-only backend must be able to switch `create` off — otherwise `repo.create()` would send a request doomed to 405 instead of AC#4's clear "Remote adapter does not support create".

`fetchMetadata` / `findByIds` cannot be disabled: they are where the two abstract members of `RxDBAdapterRemoteBase` land; without them the whole QueryCache read path doesn't hold.
