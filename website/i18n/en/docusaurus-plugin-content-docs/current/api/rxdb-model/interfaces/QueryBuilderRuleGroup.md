---
sidebar_label: "QueryBuilderRuleGroup⟨T⟩"
---

# QueryBuilderRuleGroup`<T>`

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L81)

Rule group (reuses the RxDB RuleGroup type plus UI metadata)

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; | Entity type |

## Properties

### combinator \{#combinator\}

```ts
combinator: "and" | "or";
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L90)

Logical combinator

***

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L85)

Unique identifier of the rule group

***

### rules \{#rules\}

```ts
rules: (
  | QueryBuilderRuleGroup<T>
  | QueryBuilderRule<T>)[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L95)

List of child rules (nesting supported)
