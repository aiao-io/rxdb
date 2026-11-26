---
sidebar_label: "QueryConverter⟨T⟩"
---

# QueryConverter`<T>`

Defined in: packages/rxdb-model/dist/query-builder/services/query-converter.service.d.ts:17

Query conversion service
Responsible for bidirectional conversion between QueryBuilder state and RxDB queries

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Constructors

### Constructor

```ts
new QueryConverter<T>(options?): QueryConverter<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-converter.service.d.ts:22

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`QueryConverterOptions`](../interfaces/QueryConverterOptions.md) | Converter configuration |

#### Returns

`QueryConverter`&lt;`T`&gt;

## Methods

### fromRxDBQuery() \{#fromrxdbquery\}

```ts
fromRxDBQuery(query): QueryBuilderState<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-converter.service.d.ts:49

Converts an RxDB query into QueryBuilder state

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt; | RxDB RuleGroup query object |

#### Returns

[`QueryBuilderState`](../interfaces/QueryBuilderState.md)&lt;`T`&gt;

QueryBuilder state

#### Example

```typescript
const converter = new QueryConverter<User>();
const state = converter.fromRxDBQuery(rxdbQuery);
```

***

### toRxDBQuery() \{#torxdbquery\}

```ts
toRxDBQuery(state): RuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-converter.service.d.ts:36

Converts QueryBuilder state into an RxDB query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`QueryBuilderState`](../interfaces/QueryBuilderState.md)&lt;`T`&gt; | QueryBuilder state |

#### Returns

[`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;

RxDB RuleGroup query object

#### Example

```typescript
const converter = new QueryConverter<User>();
const query = converter.toRxDBQuery(queryBuilderState);
// `{ combinator: 'and', rules: [...] }`
```
