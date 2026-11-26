---
sidebar_label: "QueryBuilderRuleGroup⟨T⟩"
---

# QueryBuilderRuleGroup`<T>`

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:73

Rule group (reuses the RxDB RuleGroup type + UI metadata)

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; | Entity type |

## Properties

### combinator \{#combinator\}

```ts
combinator: "and" | "or";
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:81

Logical combinator

***

### id \{#id\}

```ts
id: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:77

Unique identifier of the rule group

***

### rules \{#rules\}

```ts
rules: (
  | QueryBuilderRuleGroup<T>
  | QueryBuilderRule<T>)[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:85

Child rule list (nesting supported)
