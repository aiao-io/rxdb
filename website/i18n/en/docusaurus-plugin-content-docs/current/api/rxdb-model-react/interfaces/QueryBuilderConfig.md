---
sidebar_label: "QueryBuilderConfig⟨T⟩"
---

# QueryBuilderConfig`<T>`

Defined in: packages/rxdb-model/dist/query-builder/models/config.interface.d.ts:6

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

Defined in: packages/rxdb-model/dist/query-builder/models/config.interface.d.ts:22

Custom operators

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: QueryBuilderRuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/models/config.interface.d.ts:14

Initial query

***

### maxNestingLevel? \{#maxnestinglevel\}

```ts
maxNestingLevel?: number;
```

Defined in: packages/rxdb-model/dist/query-builder/models/config.interface.d.ts:18

Maximum nesting level (defaults to 5)

***

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/models/config.interface.d.ts:26

Whether it is in read-only mode

***

### schema? \{#schema\}

```ts
schema?: SchemaInfo;
```

Defined in: packages/rxdb-model/dist/query-builder/models/config.interface.d.ts:10

Schema information
