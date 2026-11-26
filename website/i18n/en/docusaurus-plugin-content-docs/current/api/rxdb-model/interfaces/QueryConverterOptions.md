# QueryConverterOptions

Defined in: [packages/rxdb-model/src/query-builder/services/query-converter.service.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-converter.service.ts#L14)

Conversion options

## Properties

### idGenerator? \{#idgenerator\}

```ts
idGenerator?: () => string;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-converter.service.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-converter.service.ts#L19)

ID generator

#### Returns

`string`

#### Default

```ts
generateId()
```
