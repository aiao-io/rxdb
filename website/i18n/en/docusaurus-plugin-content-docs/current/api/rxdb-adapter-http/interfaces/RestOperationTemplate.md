# RestOperationTemplate

Defined in: [packages/rxdb-adapter-http/src/rest.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L36)

Path template and method override for a single operation.

## Properties

### method? \{#method\}

```ts
method?: HttpMethod;
```

Defined in: [packages/rxdb-adapter-http/src/rest.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L40)

When absent, takes the operation's default method; see [createRestHandlers](../functions/createRestHandlers.md)

---

### path \{#path\}

```ts
path: string;
```

Defined in: [packages/rxdb-adapter-http/src/rest.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L38)

Path template relative to `baseUrl` (an absolute URL also works), placeholders written as `:entity` / `:id`
