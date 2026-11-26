# FieldExtractorConfig

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:32

Field extractor configuration

## Properties

### relationQueryDeep? \{#relationquerydeep\}

```ts
relationQueryDeep?: number;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:34

Relation query depth, defaults to 4

***

### systemFields? \{#systemfields\}

```ts
systemFields?: string[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:36

List of system fields, defaults to ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']
