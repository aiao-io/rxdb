---
sidebar_label: 'QueryConverter⟨T⟩'
---

# QueryConverter`<T>`

Defined in: [packages/rxdb-model/src/query-builder/services/query-converter.service.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-converter.service.ts#L26)

Query conversion service
Handles bidirectional conversion between QueryBuilder state and RxDB queries

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Constructors

### Constructor

```ts
new QueryConverter<T>(options?): QueryConverter<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-converter.service.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-converter.service.ts#L33)

#### Parameters

| Parameter  | Type                                                              | Description      |
| ---------- | ----------------------------------------------------------------- | ---------------- |
| `options?` | [`QueryConverterOptions`](../interfaces/QueryConverterOptions.md) | Converter config |

#### Returns

`QueryConverter`&lt;`T`&gt;

## Methods

### fromRxDBQuery() \{#fromrxdbquery\}

```ts
fromRxDBQuery(query): QueryBuilderState<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-converter.service.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-converter.service.ts#L66)

Converts an RxDB Query into QueryBuilder state

#### Parameters

| Parameter | Type                                                   | Description                 |
| --------- | ------------------------------------------------------ | --------------------------- |
| `query`   | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt; | RxDB RuleGroup query object |

#### Returns

[`QueryBuilderState`](../interfaces/QueryBuilderState.md)&lt;`T`&gt;

QueryBuilder state

#### Example

```typescript
const converter = new QueryConverter<User>();
const state = converter.fromRxDBQuery(rxdbQuery);
```

---

### toRxDBQuery() \{#torxdbquery\}

```ts
toRxDBQuery(state): RuleGroup<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-converter.service.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-converter.service.ts#L50)

Converts QueryBuilder state into an RxDB Query

#### Parameters

| Parameter | Type                                                                 | Description        |
| --------- | -------------------------------------------------------------------- | ------------------ |
| `state`   | [`QueryBuilderState`](../interfaces/QueryBuilderState.md)&lt;`T`&gt; | QueryBuilder state |

#### Returns

[`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;

RxDB RuleGroup query object

#### Example

```typescript
const converter = new QueryConverter<User>();
const query = converter.toRxDBQuery(queryBuilderState);
// `{ combinator: 'and', rules: [...] }`
```
