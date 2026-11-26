# RxDBClientGeneratorOptions

Defined in: [core/RxDBClientGenerator.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L45)

Code shape and query type configuration of the RxDB client generator.

## Properties

### relationQueryDeep? \{#relationquerydeep\}

```ts
relationQueryDeep?: number;
```

Defined in: [core/RxDBClientGenerator.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L53)

Relation query depth
Minimum is 1

#### Default

```ts
3;
```

#### Examples

```ts
1 allows querying own basic properties + basic properties of own relations
```

```ts
2 allows querying own basic properties + basic properties of own relations + basic properties of the relations of own relations
```

---

### splitFiles? \{#splitfiles\}

```ts
splitFiles?: boolean;
```

Defined in: [core/RxDBClientGenerator.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L58)

Whether to split by entity name into separate files, with the index file exporting all entities collectively

#### Default

```ts
false;
```
