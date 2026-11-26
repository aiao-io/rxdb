---
sidebar_label: "QueryBuilderConfig⟨T⟩"
---

# QueryBuilderConfig`<T>`

Defined in: [packages/rxdb-model/src/query-builder/models/config.interface.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/config.interface.ts#L6)

Query builder configuration

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Properties

### customOperators? \{#customoperators\}

```ts
customOperators?: OperatorDefinition[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/config.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/config.interface.ts#L25)

Custom operators

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: QueryBuilderRuleGroup<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/models/config.interface.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/config.interface.ts#L15)

Initial query

***

### maxNestingLevel? \{#maxnestinglevel\}

```ts
maxNestingLevel?: number;
```

Defined in: [packages/rxdb-model/src/query-builder/models/config.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/config.interface.ts#L20)

Maximum nesting level (default 5)

***

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/models/config.interface.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/config.interface.ts#L30)

Whether it is read-only mode

***

### schema? \{#schema\}

```ts
schema?: SchemaInfo;
```

Defined in: [packages/rxdb-model/src/query-builder/models/config.interface.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/config.interface.ts#L10)

Schema information
