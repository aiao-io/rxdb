# ModelInfo

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L8)

Model information interface

## Properties

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L12)

Display name of the entity

---

### entityClass \{#entityclass\}

```ts
entityClass: new (...args) => unknown;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L15)

Entity class constructor

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| ...`args` | `never`[] |

#### Returns

`unknown`

---

### metadata \{#metadata\}

```ts
metadata: EntityMetadata;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L17)

RxDB entity metadata

---

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L10)

Entity name
