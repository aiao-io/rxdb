# RestOperation

```ts
type RestOperation = 'fetchMetadata' | 'findByIds' | 'create' | 'update' | 'delete' | 'version' | 'isTableExisted';
```

Defined in: [packages/rxdb-adapter-http/src/rest.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/rest.ts#L32)

The operations expressible as templates, one-to-one with the seven fields of [HttpHandlers](../interfaces/HttpHandlers.md).
