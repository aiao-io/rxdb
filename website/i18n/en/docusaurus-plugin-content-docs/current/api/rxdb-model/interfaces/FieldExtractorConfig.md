# FieldExtractorConfig

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L37)

Field extractor configuration

## Properties

### relationQueryDeep? \{#relationquerydeep\}

```ts
relationQueryDeep?: number;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L39)

Relation query depth, default 4

---

### systemFields? \{#systemfields\}

```ts
systemFields?: string[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L41)

System field list, default ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']
