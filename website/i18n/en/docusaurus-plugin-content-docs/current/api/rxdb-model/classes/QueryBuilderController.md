---
sidebar_label: "QueryBuilderController⟨T⟩"
---

# QueryBuilderController`<T>`

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L45)

UI-free facade wrapper around an existing QueryBuilderService.

## Remarks

All rule conversion and validation is still done by QueryBuilderService, avoiding a second set of query semantics.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Constructors

### Constructor

```ts
new QueryBuilderController<T>(options?): QueryBuilderController<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L58)

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L54)

Reads a query snapshot isolated from the internal state.

##### Returns

[`QueryBuilderSnapshot`](../interfaces/QueryBuilderSnapshot.md)&lt;`T`&gt;

## Methods

### addGroup() \{#addgroup\}

```ts
addGroup(parentGroupId?, combinator?): string;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L106)

Adds an AND or OR rule group, keeping the existing nesting limit.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `parentGroupId?` | `string` \| `null` | `undefined` |
| `combinator?` | `"and"` \| `"or"` | `'and'` |

#### Returns

`string`

***

### addRule() \{#addrule\}

```ts
addRule(parentGroupId?, rule?): string;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L100)

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L134)

Clears the rules and establishes a new empty root group.

#### Returns

`void`

***

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L153)

Unsubscribes from the query service and destroys the internal service.

#### Returns

`void`

***

### fromRxDBQuery() \{#fromrxdbquery\}

```ts
fromRxDBQuery(query): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L139)

Loads an RxDB query and has the existing converter assign rule IDs.

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L129)

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L124)

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L91)

Replaces the field metadata and re-validates the existing rules.

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L84)

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L144)

Converts the current state into an RxDB query and returns an isolated copy.

#### Returns

[`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;

***

### updateGroupCombinator() \{#updategroupcombinator\}

```ts
updateGroupCombinator(groupId, combinator): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L118)

Updates the AND or OR combination of a rule group.

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L112)

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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L148)

Validates the current rule tree and returns field-located errors.

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)
