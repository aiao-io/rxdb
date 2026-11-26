---
sidebar_label: 'QueryBuilderService⟨T⟩'
---

# QueryBuilderService`<T>`

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L101)

QueryBuilder core service
RxJS-based reactive state management

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Constructors

### Constructor

```ts
new QueryBuilderService<T>(options?): QueryBuilderService<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L136)

#### Parameters

| Parameter  | Type                                                                                   | Description                                                        |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `options?` | [`QueryBuilderServiceOptions`](../interfaces/QueryBuilderServiceOptions.md)&lt;`T`&gt; | Query builder config (schema / initialQuery / nesting limit, etc.) |

#### Returns

`QueryBuilderService`&lt;`T`&gt;

## Properties

### query$ \{#query\}

```ts
readonly query$: Observable<RuleGroup<T>>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L133)

Observable in RxDB Query format

---

### rootGroup$ \{#rootgroup\}

```ts
readonly rootGroup$: Observable<QueryBuilderRuleGroup<T>>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L123)

Observable of the root rule group

---

### state$ \{#state\}

```ts
readonly state$: Observable<QueryBuilderState<T>>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L118)

Observable stream of state changes

---

### validation$ \{#validation\}

```ts
readonly validation$: Observable<ValidationResult>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L128)

Observable of validation results (recomputed on rule or field metadata changes; not re-emitted when the conclusion is unchanged)

## Methods

### addGroup() \{#addgroup\}

```ts
addGroup(parentGroupId?, combinator?): string;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L269)

Adds a rule group

#### Parameters

| Parameter        | Type               | Default value        |
| ---------------- | ------------------ | -------------------- |
| `parentGroupId?` | `string` \| `null` | `null`               |
| `combinator?`    | `"and"` \| `"or"`  | `DEFAULT_COMBINATOR` |

#### Returns

`string`

---

### addRule() \{#addrule\}

```ts
addRule(parentGroupId?, rule?): string;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L245)

Adds a rule

#### Parameters

| Parameter        | Type                                                                       | Default value |
| ---------------- | -------------------------------------------------------------------------- | ------------- |
| `parentGroupId?` | `string` \| `null`                                                         | `null`        |
| `rule?`          | `Partial`&lt;`Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt;&gt; | `undefined`   |

#### Returns

`string`

---

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L374)

Clears all rules

#### Returns

`void`

---

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:381](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L381)

Destroys the service

#### Returns

`void`

---

### fromRxDBQuery() \{#fromrxdbquery\}

```ts
fromRxDBQuery(query): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:401](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L401)

Loads from an RxDB Query

Accepts both RuleGroup (without id) and QueryBuilderRuleGroup (with id).
Ids are reassigned internally; the original ids are ignored.

#### Parameters

| Parameter | Type                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `query`   | \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`T`&gt; \| [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt; |

#### Returns

`void`

---

### getConfig() \{#getconfig\}

```ts
getConfig(): QueryBuilderConfig<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L200)

Gets the current config

#### Returns

[`QueryBuilderConfig`](../interfaces/QueryBuilderConfig.md)&lt;`T`&gt;

---

### getFields() \{#getfields\}

```ts
getFields(): FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L221)

Gets the field list

#### Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

---

### getMaxNestingLevel() \{#getmaxnestinglevel\}

```ts
getMaxNestingLevel(): number;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L207)

Gets the maximum nesting level

#### Returns

`number`

---

### getOperatorRegistry() \{#getoperatorregistry\}

```ts
getOperatorRegistry(): OperatorRegistry;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L236)

Gets the operator registry

#### Returns

[`OperatorRegistry`](OperatorRegistry.md)

---

### getState() \{#getstate\}

```ts
getState(): QueryBuilderState<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L193)

Gets the current state snapshot

#### Returns

[`QueryBuilderState`](../interfaces/QueryBuilderState.md)&lt;`T`&gt;

---

### isValid() \{#isvalid\}

```ts
isValid(): boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:421](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L421)

Checks whether the current state is valid

#### Returns

`boolean`

---

### moveItem() \{#moveitem\}

```ts
moveItem(
   itemId,
   targetGroupId,
   targetIndex
): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:334](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L334)

Moves a rule or group to the given position in the target group

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `itemId`        | `string` |
| `targetGroupId` | `string` |
| `targetIndex`   | `number` |

#### Returns

`void`

---

### remove() \{#remove\}

```ts
remove(itemId): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L319)

Deletes a rule or group

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `itemId`  | `string` |

#### Returns

`void`

---

### setFields() \{#setfields\}

```ts
setFields(fields): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L229)

Sets the field list (an empty list also takes effect: fields referenced by existing rules are then validated as "nonexistent").
A subscribed validation$ is recomputed immediately with the new fields; the query itself is unchanged, and rootGroup$ / query$ do not emit.

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `fields`  | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] |

#### Returns

`void`

---

### setMaxNestingLevel() \{#setmaxnestinglevel\}

```ts
setMaxNestingLevel(level): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L214)

Updates the maximum nesting level dynamically

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `level`   | `number` |

#### Returns

`void`

---

### toRxDBQuery() \{#torxdbquery\}

```ts
toRxDBQuery(): RuleGroup<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:391](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L391)

Gets the RxDB Query format

#### Returns

[`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;

---

### updateGroupCombinator() \{#updategroupcombinator\}

```ts
updateGroupCombinator(groupId, combinator): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:310](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L310)

Updates the combinator of a group

#### Parameters

| Parameter    | Type              |
| ------------ | ----------------- |
| `groupId`    | `string`          |
| `combinator` | `"and"` \| `"or"` |

#### Returns

`void`

---

### updateRule() \{#updaterule\}

```ts
updateRule(ruleId, updates): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:297](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L297)

Updates a rule

#### Parameters

| Parameter | Type                                                                       |
| --------- | -------------------------------------------------------------------------- |
| `ruleId`  | `string`                                                                   |
| `updates` | `Partial`&lt;`Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt;&gt; |

#### Returns

`void`

---

### validate() \{#validate\}

```ts
validate(): ValidationResult;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:411](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L411)

Runs validation and returns the result

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)
