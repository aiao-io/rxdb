# ModelInfo

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:6

Model information interface

## Properties

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:10

Display name of the entity

***

### entityClass \{#entityclass\}

```ts
entityClass: new (...args) => unknown;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:12

Constructor of the entity class

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `never`[] |

#### Returns

`unknown`

***

### metadata \{#metadata\}

```ts
metadata: EntityMetadata;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:14

RxDB entity metadata

***

### name \{#name\}

```ts
name: string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:8

Entity name
