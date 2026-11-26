# OperatorSelectorComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L33)

Operator selector component

## Description

Provides operator selection based on [PopoverSelectComponent](PopoverSelectComponent.md),
automatically filtering the available operators by field type or metadata.
Supports search filtering and keyboard navigation.

Supports two usage styles:

1. Direct template use: listen for the `(operatorChange)` output event
2. Injection via NgComponentOutlet: pass the `operatorChangeFn` callback input

## Constructors

### Constructor

```ts
new OperatorSelectorComponent(): OperatorSelectorComponent;
```

#### Returns

`OperatorSelectorComponent`

## Properties

### fieldMetadata \{#fieldmetadata\}

```ts
readonly fieldMetadata: InputSignal<FieldMetadata | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L45)

---

### fieldType \{#fieldtype\}

```ts
readonly fieldType: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L46)

---

### operatorChange \{#operatorchange\}

```ts
readonly operatorChange: OutputEmitterRef<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L53)

Output event for direct template use

---

### operatorChangeFn \{#operatorchangefn\}

```ts
readonly operatorChangeFn: InputSignal<((op) => void) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L50)

Callback input used when injected via NgComponentOutlet

---

### operatorOptions \{#operatoroptions\}

```ts
readonly operatorOptions: Signal<object[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L38)

---

### selectedOperator \{#selectedoperator\}

```ts
readonly selectedOperator: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L47)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L58)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

---

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L55)

##### Returns

(`key`, `params?`) => `string`

## Methods

### onOperatorChange() \{#onoperatorchange\}

```ts
onOperatorChange(op): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/operator-selector/operator-selector.component.ts#L62)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `op`      | `string` |

#### Returns

`void`
