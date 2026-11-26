# createRestHandlers()

```ts
function createRestHandlers(options?): HttpHandlers;
```

Defined in: [packages/rxdb-adapter-http/src/rest.ts:395](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L395)

Produces a full set of [HttpHandlers](../interfaces/HttpHandlers.md) from REST resource URL templates (US-212 AC#27).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`RestHandlersOptions`](../interfaces/RestHandlersOptions.md) | resource mapping and per-operation template overrides |

## Returns

[`HttpHandlers`](../interfaces/HttpHandlers.md)

a handler set ready to hand to `RxDBAdapterHttp`

## Remarks

The produced handlers are **fully equivalent** to handwritten ones: they likewise only do protocol mapping and never touch the network — sending requests, injecting auth, extracting `status`, pagination, chunking and single emission all stay on the adapter's side. So this module has no access to, and no need to change, any phase-A contract.

Default templates (method / path):

| Operation        | Method  | Path                | Default output          |
| ---------------- | ------- | ------------------- | ----------------------- |
| `fetchMetadata`  | `POST`  | `:entity/metadata`  | yes (cannot be disabled) |
| `findByIds`      | `POST`  | `:entity/by-ids`    | yes (cannot be disabled) |
| `create`         | `POST`  | `:entity`           | yes                     |
| `update`         | `PATCH` | `:entity/:id`       | yes                     |
| `delete`         | `POST`  | `:entity/delete`    | yes                     |
| `version`        | `GET`   | —                   | no                      |
| `isTableExisted` | `HEAD`  | —                   | no                      |

The path column of the last two rows is `—` and **not** blank: these two operations have no default path, and without `templates.version.path` / `templates.isTableExisted.path` no handler is produced at all. `isTableExisted`'s method column still says `HEAD`, which is the default method that only takes effect once a path is given (for why there's no default path, see the comment on that entry in `REST_OPERATIONS`).

Request body shapes: `fetchMetadata` sends `{ where, offset, limit, pageToken }` (`where` is a JSON `RuleGroup`, **not SQL**), `findByIds` and `delete` send `{ ids }`, `create` / `update` send the caller's data directly.

## Example

```typescript
rxdb.adapter('http', db => new RxDBAdapterHttp(db, {
  baseUrl: 'https://api.example.com/v1',
  handlers: createRestHandlers({
    resources: { Recipe: 'recipes' },
    templates: `{ version: { path: 'meta/version' }, delete: null }`
  })
}));
// fetchMetadata → POST https://api.example.com/v1/recipes/metadata
// update        → PATCH https://api.example.com/v1/recipes/{id}
// delete        → not produced; repo.delete() takes AC#4's fail-fast
```

## Throws

HttpConfigError template path empty / containing `?`, `#`, whitespace / illegal method /
  placeholder-set mismatch / a required handler disabled / a `resources` value that isn't a valid path segment
