# UIRule

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:9

UI rule (a loose type used internally by the query builder components)

## Description

Because Rule\<T\> is a union type, partial updates are hard to handle in UI components.
This type provides loose field types to make them easier for UI components to manipulate.

## Properties

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:17

Field name

***

### id \{#id\}

```ts
id: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:13

Unique identifier of the rule

***

### operator \{#operator\}

```ts
operator: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:21

Operator

***

### value? \{#value\}

```ts
value?: unknown;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:25

Rule value (optional)

***

### where? \{#where\}

```ts
where?: QueryBuilderRuleGroup<Record<string, unknown>>;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:29

Subquery condition of the EXISTS/NOT EXISTS operators
