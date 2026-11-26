---
sidebar_label: "QueryBuilderComponent⟨T⟩"
---

# QueryBuilderComponent`<T>`

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L131)

Angular Query Builder root component

## Description

Provides a visual query condition building interface, supporting:
- Passing SchemaInfo or FieldMetadata[] to define available fields
- Drag reordering of rules and groups
- Nested grouping (up to 5 levels)
- Real-time validation

## Example

```html
<rxdb-query-builder
  [schema]="schema"
  (queryChange)="onQueryChange($event)"
/>
```

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* `object` |

## Implements

- `OnDestroy`

## Constructors

### Constructor

```ts
new QueryBuilderComponent<T>(): QueryBuilderComponent<T>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L229)

#### Returns

`QueryBuilderComponent`&lt;`T`&gt;

## Properties

### dragDropHandler \{#dragdrophandler\}

```ts
readonly dragDropHandler: QueryDragDropHandler;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L181)

***

### enableCollapse \{#enablecollapse\}

```ts
readonly enableCollapse: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L179)

Whether group expand/collapse is enabled (enabled by default)

***

### enableDrag \{#enabledrag\}

```ts
readonly enableDrag: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L174)

Whether drag reordering is enabled (enabled by default)

***

### fields \{#fields\}

```ts
readonly fields: InputSignal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L154)

Field list (passed directly, takes priority over schema)

***

### fieldsComputed \{#fieldscomputed\}

```ts
readonly fieldsComputed: Signal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:194](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L194)

The computed field list

***

### hasRules \{#hasrules\}

```ts
readonly hasRules: Signal<boolean | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L217)

Whether there are rules

***

### height \{#height\}

```ts
readonly height: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L169)

Maximum height of the content area (scrolls when exceeded), accepts any CSS length value, e.g. `'400px'`, `'50vh'`

***

### initialQuery \{#initialquery\}

```ts
readonly initialQuery: InputSignal<
  | RxDBQueryOutput<T>
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L159)

Initial query conditions (optional)

***

### maxDepth \{#maxdepth\}

```ts
readonly maxDepth: InputSignal<number>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L164)

Maximum nesting level (default 5)

***

### queryChange \{#querychange\}

```ts
readonly queryChange: OutputEmitterRef<RxDBQueryOutput<T>>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L186)

Query condition change event

***

### rootGroup \{#rootgroup\}

```ts
readonly rootGroup: Signal<UIRuleGroup | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L206)

Root rule group

***

### schema \{#schema\}

```ts
readonly schema: InputSignal<SchemaInfo | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L149)

Schema information, including the field definitions

***

### validationChange \{#validationchange\}

```ts
readonly validationChange: OutputEmitterRef<ValidationResult>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:191](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L191)

Validation state change event

***

### validationErrors \{#validationerrors\}

```ts
readonly validationErrors: Signal<ValidationError[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L211)

Validation error list

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L225)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

***

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L222)

##### Returns

(`key`, `params?`) => `string`

## Methods

### addFirstRule() \{#addfirstrule\}

```ts
addFirstRule(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:285](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L285)

Adds the first rule

#### Returns

`void`

***

### clearAll() \{#clearall\}

```ts
clearAll(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:300](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L300)

Clears all rules

#### Returns

`void`

***

### ngOnDestroy() \{#ngondestroy\}

```ts
ngOnDestroy(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L280)

Destroys the service

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

***

### onAddGroup() \{#onaddgroup\}

```ts
onAddGroup(parentId): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:311](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L311)

Adds a subgroup to the given group

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentId` | `string` |

#### Returns

`void`

***

### onAddRule() \{#onaddrule\}

```ts
onAddRule(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:305](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L305)

Adds a rule to the given group

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `parentId`: `string`; `rule`: `Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt;; \} |
| `event.parentId` | `string` |
| `event.rule` | `Omit`&lt;[`UIRule`](../interfaces/UIRule.md), `"id"`&gt; |

#### Returns

`void`

***

### onKeyDown() \{#onkeydown\}

```ts
onKeyDown(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L332)

Keyboard shortcut handling

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `KeyboardEvent` |

#### Returns

`void`

***

### onRemoveItem() \{#onremoveitem\}

```ts
onRemoveItem(id): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L317)

Deletes a rule or group

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

`void`

***

### onUpdateCombinator() \{#onupdatecombinator\}

```ts
onUpdateCombinator(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:327](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L327)

Updates the combinator

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `combinator`: `"and"` \| `"or"`; `id`: `string`; \} |
| `event.combinator` | `"and"` \| `"or"` |
| `event.id` | `string` |

#### Returns

`void`

***

### onUpdateRule() \{#onupdaterule\}

```ts
onUpdateRule(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:322](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L322)

Updates a rule

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `id`: `string`; `updates`: `Partial`&lt;[`UIRule`](../interfaces/UIRule.md)&gt;; \} |
| `event.id` | `string` |
| `event.updates` | `Partial`&lt;[`UIRule`](../interfaces/UIRule.md)&gt; |

#### Returns

`void`
