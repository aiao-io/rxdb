---
sidebar_label: "QueryBuilderService⟨T⟩"
---

# QueryBuilderService`<T>`

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:49

QueryBuilder core service
RxJS-based reactive state management

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Constructors

### Constructor

```ts
new QueryBuilderService<T>(options?): QueryBuilderService<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:79

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`QueryBuilderServiceOptions`](../interfaces/QueryBuilderServiceOptions.md)&lt;`T`&gt; | Query builder configuration (schema / initialQuery / nesting limit, etc.) |

#### Returns

`QueryBuilderService`&lt;`T`&gt;

## Properties

### query$ \{#query\}

```ts
readonly query$: Observable<RuleGroup<T>>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:77

Observable in RxDB query format

***

### rootGroup$ \{#rootgroup\}

```ts
readonly rootGroup$: Observable<QueryBuilderRuleGroup<T>>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:69

Observable of the root rule group

***

### state$ \{#state\}

```ts
readonly state$: Observable<QueryBuilderState<T>>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:65

Observable stream of state changes

***

### validation$ \{#validation\}

```ts
readonly validation$: Observable<ValidationResult>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:73

Observable of validation results (recomputed when rules or field metadata change; not re-emitted when the conclusion is unchanged)

## Methods

### addGroup() \{#addgroup\}

```ts
addGroup(parentGroupId?, combinator?): string;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:116

Adds a rule group

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

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:112

Adds a rule

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentGroupId?` | `string` \| `null` |
| `rule?` | `Partial`&lt;`Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt;&gt; |

#### Returns

`string`

***

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:136

Clears all rules

#### Returns

`void`

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:140

Destroys the service

#### Returns

`void`

***

### fromRxDBQuery() \{#fromrxdbquery\}

```ts
fromRxDBQuery(query): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:151

Loads from an RxDB query

Accepts both RuleGroup (no id) and QueryBuilderRuleGroup (with id).
IDs are reassigned internally; the original ids are ignored.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`T`&gt; \| [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt; |

#### Returns

`void`

***

### getConfig() \{#getconfig\}

```ts
getConfig(): QueryBuilderConfig<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:87

Gets the current configuration

#### Returns

[`QueryBuilderConfig`](../interfaces/QueryBuilderConfig.md)&lt;`T`&gt;

***

### getFields() \{#getfields\}

```ts
getFields(): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:99

Gets the field list

#### Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

***

### getMaxNestingLevel() \{#getmaxnestinglevel\}

```ts
getMaxNestingLevel(): number;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:91

Gets the maximum nesting level

#### Returns

`number`

***

### getOperatorRegistry() \{#getoperatorregistry\}

```ts
getOperatorRegistry(): OperatorRegistry;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:108

Gets the operator registry

#### Returns

[`OperatorRegistry`](OperatorRegistry.md)

***

### getState() \{#getstate\}

```ts
getState(): QueryBuilderState<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:83

Gets the current state snapshot

#### Returns

[`QueryBuilderState`](../interfaces/QueryBuilderState.md)&lt;`T`&gt;

***

### isValid() \{#isvalid\}

```ts
isValid(): boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:159

Checks whether the current state is valid

#### Returns

`boolean`

***

### moveItem() \{#moveitem\}

```ts
moveItem(
   itemId, 
   targetGroupId, 
   targetIndex
): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:132

Moves a rule or group to the specified position in the target group

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

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:128

Deletes a rule or group

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

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:104

Sets the field list (an empty list takes effect too: fields referenced by existing rules are then validated as non-existent).
Subscribed validation$ recomputes immediately with the new fields; the query itself is unchanged and rootGroup$ / query$ do not emit.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fields` | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] |

#### Returns

`void`

***

### setMaxNestingLevel() \{#setmaxnestinglevel\}

```ts
setMaxNestingLevel(level): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:95

Dynamically updates the maximum nesting level

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `level` | `number` |

#### Returns

`void`

***

### toRxDBQuery() \{#torxdbquery\}

```ts
toRxDBQuery(): RuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:144

Gets the RxDB query format

#### Returns

[`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;

***

### updateGroupCombinator() \{#updategroupcombinator\}

```ts
updateGroupCombinator(groupId, combinator): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:124

Updates a group's combinator

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

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:120

Updates a rule

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ruleId` | `string` |
| `updates` | `Partial`&lt;`Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt;&gt; |

#### Returns

`void`

***

### validate() \{#validate\}

```ts
validate(): ValidationResult;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:155

Runs validation and returns the result

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)
