# SubqueryBuilderComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L68)

Subquery builder component

## Description

Nested query conditions for the EXISTS/NOT EXISTS operators.
Supports:

- Adding sub-conditions
- Nested rule groups
- Clearing sub-conditions

## Implements

- `OnDestroy`

## Constructors

### Constructor

```ts
new SubqueryBuilderComponent(): SubqueryBuilderComponent;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L114)

#### Returns

`SubqueryBuilderComponent`

## Properties

### fields \{#fields\}

```ts
readonly fields: InputSignal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L82)

Field list

---

### hasRules \{#hasrules\}

```ts
readonly hasRules: Signal<boolean | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L102)

Whether there are rules

---

### initialQuery \{#initialquery\}

```ts
readonly initialQuery: InputSignal<
  | QueryBuilderRuleGroup<Record<string, unknown>>
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L85)

Initial query

---

### maxDepth \{#maxdepth\}

```ts
readonly maxDepth: InputSignal<number>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L88)

Maximum nesting level

---

### queryChange \{#querychange\}

```ts
readonly queryChange: OutputEmitterRef<
  | {
  combinator: "and" | "or";
  rules: unknown[];
}
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L91)

Query change event

---

### rootGroup \{#rootgroup\}

```ts
readonly rootGroup: Signal<UIRuleGroup | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L97)

Root rule group

---

### validationChange \{#validationchange\}

```ts
readonly validationChange: OutputEmitterRef<ValidationResult>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L94)

Validation change event

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L110)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

---

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L107)

##### Returns

(`key`, `params?`) => `string`

## Methods

### handleAddFirstRule() \{#handleaddfirstrule\}

```ts
handleAddFirstRule(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L177)

Adds the first rule

#### Returns

`void`

---

### handleClear() \{#handleclear\}

```ts
handleClear(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L192)

Clears all rules

#### Returns

`void`

---

### ngOnDestroy() \{#ngondestroy\}

```ts
ngOnDestroy(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L172)

Destroys the service

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

---

### onAddGroup() \{#onaddgroup\}

```ts
onAddGroup(parentId): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L202)

Adds a subgroup to the given group

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `parentId` | `string` |

#### Returns

`void`

---

### onAddRule() \{#onaddrule\}

```ts
onAddRule(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L197)

Adds a rule to the given group

#### Parameters

| Parameter        | Type                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `event`          | \{ `parentId`: `string`; `rule`: `Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt;; \} |
| `event.parentId` | `string`                                                                                       |
| `event.rule`     | `Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt;                                      |

#### Returns

`void`

---

### onRemoveItem() \{#onremoveitem\}

```ts
onRemoveItem(id): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L207)

Deletes a rule or group

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`void`

---

### onUpdateCombinator() \{#onupdatecombinator\}

```ts
onUpdateCombinator(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L217)

Updates the combinator

#### Parameters

| Parameter          | Type                                                   |
| ------------------ | ------------------------------------------------------ |
| `event`            | \{ `combinator`: `"and"` \| `"or"`; `id`: `string`; \} |
| `event.combinator` | `"and"` \| `"or"`                                      |
| `event.id`         | `string`                                               |

#### Returns

`void`

---

### onUpdateRule() \{#onupdaterule\}

```ts
onUpdateRule(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/subquery-builder/subquery-builder.component.ts#L212)

Updates a rule

#### Parameters

| Parameter       | Type                                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| `event`         | \{ `id`: `string`; `updates`: `Partial`&lt;[`UIRule`](../interfaces/UIRule.md)&gt;; \} |
| `event.id`      | `string`                                                                               |
| `event.updates` | `Partial`&lt;[`UIRule`](../interfaces/UIRule.md)&gt;                                   |

#### Returns

`void`
