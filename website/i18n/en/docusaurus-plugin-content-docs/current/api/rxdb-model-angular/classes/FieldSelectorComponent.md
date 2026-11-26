# FieldSelectorComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L33)

Field selector component

## Description

Displays the tree field structure using the Popover API, with filtering and expand/collapse for nested relation fields.
Provides full keyboard navigation and accessibility support based on the CDK `ActiveDescendantKeyManager`.
Does not depend on any third-party UI library.

Supports two usage styles:
1. Direct template use: listen for the `(fieldChange)` output event
2. Injection via NgComponentOutlet: pass the `fieldChangeFn` callback input

## Constructors

### Constructor

```ts
new FieldSelectorComponent(): FieldSelectorComponent;
```

#### Returns

`FieldSelectorComponent`

## Properties

### fieldChange \{#fieldchange\}

```ts
readonly fieldChange: OutputEmitterRef<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L44)

Output event for direct template use

***

### fieldChangeFn \{#fieldchangefn\}

```ts
readonly fieldChangeFn: InputSignal<((field) => void) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L41)

Callback input used when injected via NgComponentOutlet

***

### fields \{#fields\}

```ts
readonly fields: InputSignal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L36)

***

### fieldTree \{#fieldtree\}

```ts
readonly fieldTree: Signal<FieldTreeNode[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L46)

***

### placeholder \{#placeholder\}

```ts
readonly placeholder: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L38)

***

### selectedField \{#selectedfield\}

```ts
readonly selectedField: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L37)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L51)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

***

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L48)

##### Returns

(`key`, `params?`) => `string`

## Methods

### onSelect() \{#onselect\}

```ts
onSelect(field): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/field-selector/field-selector.component.ts#L55)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `string` |

#### Returns

`void`
