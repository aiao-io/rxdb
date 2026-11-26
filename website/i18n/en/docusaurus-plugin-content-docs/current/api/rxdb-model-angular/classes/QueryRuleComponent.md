# QueryRuleComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L77)

Single query rule component

## Description

Shows the editing UI for a single query rule:

- Field selector
- Operator selector
- Value input box
- Delete button

## Constructors

### Constructor

```ts
new QueryRuleComponent(): QueryRuleComponent;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L178)

#### Returns

`QueryRuleComponent`

## Properties

### currentEnumOptions \{#currentenumoptions\}

```ts
readonly currentEnumOptions: Signal<unknown[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L132)

---

### currentField \{#currentfield\}

```ts
readonly currentField: Signal<FieldMetadata | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L126)

---

### currentFieldType \{#currentfieldtype\}

```ts
readonly currentFieldType: Signal<PropertyType>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L131)

---

### currentRelationFields \{#currentrelationfields\}

```ts
readonly currentRelationFields: Signal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L135)

Field list of the current field's relation target entity

---

### errors \{#errors\}

```ts
readonly errors: InputSignal<ValidationError[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L88)

---

### errorTooltip \{#errortooltip\}

```ts
readonly errorTooltip: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L103)

---

### fieldAsString \{#fieldasstring\}

```ts
readonly fieldAsString: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L93)

---

### fields \{#fields\}

```ts
readonly fields: InputSignal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L87)

---

### fieldSelectorInputs \{#fieldselectorinputs\}

```ts
readonly fieldSelectorInputs: Signal<{
  fieldChangeFn: (field) => void;
  fields: FieldMetadata[];
  selectedField: string;
}>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L143)

NgComponentOutlet inputs: field selector (fieldChangeCb is a lazy reference; declaration order does not affect the runtime)

---

### isExistsOperator \{#isexistsoperator\}

```ts
readonly isExistsOperator: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L108)

---

### isNoValueOperator \{#isnovalueoperator\}

```ts
readonly isNoValueOperator: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L109)

---

### operatorSelectorInputs \{#operatorselectorinputs\}

```ts
readonly operatorSelectorInputs: Signal<{
  fieldMetadata: FieldMetadata | undefined;
  fieldType: PropertyType;
  operatorChangeFn: (op) => void;
  selectedOperator: string;
}>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L150)

NgComponentOutlet inputs: operator selector

---

### remove \{#remove\}

```ts
readonly remove: OutputEmitterRef<void>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L91)

---

### rule \{#rule\}

```ts
readonly rule: InputSignal<UIRuleWithWhere>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L86)

---

### ruleErrors \{#ruleerrors\}

```ts
readonly ruleErrors: Signal<ValidationError[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L94)

---

### ruleWhere \{#rulewhere\}

```ts
readonly ruleWhere: Signal<
  | QueryBuilderRuleGroup<Record<string, unknown>>
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L140)

The rule's where subquery

---

### showSubquery \{#showsubquery\}

```ts
readonly showSubquery: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L112)

Whether the subquery panel is expanded (auto-expanded when there are existing where rules)

---

### subqueryVisible \{#subqueryvisible\}

```ts
readonly subqueryVisible: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L118)

Auto-expands when the rule's where already has content.
Wraps the check in a computed that watches rule().where, checked before the button is shown.

---

### theme \{#theme\}

```ts
protected readonly theme: QueryBuilderTheme;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L84)

The injected theme (falls back to the default theme)

---

### update \{#update\}

```ts
readonly update: OutputEmitterRef<{
  id: string;
  updates: Partial<UIRuleWithWhere>;
}>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L90)

---

### valueInputInputs \{#valueinputinputs\}

```ts
readonly valueInputInputs: Signal<{
  enumOptions: unknown[];
  errorMessage: string;
  fieldType: PropertyType;
  operator: string;
  relationFields: FieldMetadata[];
  value: unknown;
  valueChangeFn: (value) => void;
  where:   | QueryBuilderRuleGroup<Record<string, unknown>>
     | undefined;
  whereChangeFn: (where) => void;
}>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L158)

NgComponentOutlet inputs: value input

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L174)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

---

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L171)

Automatically collapses the panel and restores the + sub-condition button when sub-conditions are cleared/all deleted

##### Returns

(`key`, `params?`) => `string`

## Methods

### onAddSubcondition() \{#onaddsubcondition\}

```ts
onAddSubcondition(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L207)

Adds a sub-condition: expands the panel and creates a default sub-rule

#### Returns

`void`

---

### onFieldChange() \{#onfieldchange\}

```ts
onFieldChange(fieldName): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L190)

Field change

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `fieldName` | `string` |

#### Returns

`void`

---

### onOperatorChange() \{#onoperatorchange\}

```ts
onOperatorChange(operator): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L232)

Operator change

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `operator` | `string` |

#### Returns

`void`

---

### onRemove() \{#onremove\}

```ts
onRemove(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L261)

Deletes the rule

#### Returns

`void`

---

### onValueChange() \{#onvaluechange\}

```ts
onValueChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L245)

Value change

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `unknown` |

#### Returns

`void`

---

### onWhereChange() \{#onwherechange\}

```ts
onWhereChange(where): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-rule/query-rule.component.ts#L253)

Subquery condition change

#### Parameters

| Parameter | Type                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `where`   | \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`Record`&lt;`string`, `unknown`&gt;&gt; \| `undefined` |

#### Returns

`void`
