---
sidebar_label: "QueryBuilderController⟨T⟩"
---

# QueryBuilderController`<T>`

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:34

UI-free facade wrapping the existing QueryBuilderService.

## Remarks

All rule conversion and validation is still performed by QueryBuilderService, avoiding a second set of query semantics.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Constructors

### Constructor

```ts
new QueryBuilderController<T>(options?): QueryBuilderController<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:38

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt; |

#### Returns

`QueryBuilderController`&lt;`T`&gt;

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): QueryBuilderSnapshot<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:37

Reads a query snapshot isolated from the internal state.

##### Returns

[`QueryBuilderSnapshot`](../interfaces/QueryBuilderSnapshot.md)&lt;`T`&gt;

## Methods

### addGroup() \{#addgroup\}

```ts
addGroup(parentGroupId?, combinator?): string;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:46

Adds an AND or OR rule group, honoring the existing nesting limit.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentGroupId?` | `string` \| `null` |
| `combinator?` | `"and"` \| `"or"` |

#### Returns

`string`

***

### addRule() \{#addrule\}

```ts
addRule(parentGroupId?, rule?): string;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:44

Adds a rule to the target group and returns the rule ID.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentGroupId?` | `string` \| `null` |
| `rule?` | `Partial`&lt;`Omit`&lt;[`QueryBuilderRule`](../type-aliases/QueryBuilderRule.md)&lt;`T`&gt;, `"id"`&gt;&gt; |

#### Returns

`string`

***

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:56

Clears the rules and creates a new empty root group.

#### Returns

`void`

***

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:64

Unsubscribes from the query service and destroys the internal service.

#### Returns

`void`

***

### fromRxDBQuery() \{#fromrxdbquery\}

```ts
fromRxDBQuery(query): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:58

Loads an RxDB query and assigns rule IDs via the existing converter.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | \| [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt; \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`T`&gt; |

#### Returns

`void`

***

### moveItem() \{#moveitem\}

```ts
moveItem(
   itemId, 
   targetGroupId, 
   targetIndex
): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:54

Moves a rule or group to the given position in the target group.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `itemId` | `string` |
| `targetGroupId` | `string` |
| `targetIndex` | `number` |

#### Returns

`void`

***

### remove() \{#remove\}

```ts
remove(itemId): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:52

Deletes a rule or a non-root rule group.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `itemId` | `string` |

#### Returns

`void`

***

### setFields() \{#setfields\}

```ts
setFields(fields): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:42

Replaces the field metadata and re-validates existing rules.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fields` | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] |

#### Returns

`void`

***

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:40

Subscribes to query state events and returns an unsubscribe function.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | `QueryListener`&lt;`T`&gt; |

#### Returns

() => `void`

***

### toRxDBQuery() \{#torxdbquery\}

```ts
toRxDBQuery(): RuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:60

Converts the current state into an RxDB query and returns an isolated copy.

#### Returns

[`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;

***

### updateGroupCombinator() \{#updategroupcombinator\}

```ts
updateGroupCombinator(groupId, combinator): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:50

Updates a rule group's AND or OR combination.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `groupId` | `string` |
| `combinator` | `"and"` \| `"or"` |

#### Returns

`void`

***

### updateRule() \{#updaterule\}

```ts
updateRule(ruleId, updates): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:48

Modifies the field, operator, or value of the given rule.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ruleId` | `string` |
| `updates` | `Partial`&lt;`Omit`&lt;[`QueryBuilderRule`](../type-aliases/QueryBuilderRule.md)&lt;`T`&gt;, `"id"`&gt;&gt; |

#### Returns

`void`

***

### validate() \{#validate\}

```ts
validate(): ValidationResult;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:62

Validates the current rule tree and returns field-located errors.

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)
