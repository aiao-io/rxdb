# EntityFormComponent

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L259)

Metadata-driven form component: renders the matching input control by field type, supports create / edit / view modes;
parsing, formatting, and validation are all delegated to @aiao/rxdb-model.

## Constructors

### Constructor

```ts
new EntityFormComponent(): EntityFormComponent;
```

#### Returns

`EntityFormComponent`

## Properties

### data \{#data\}

```ts
readonly data: InputSignal<EntityFormData>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:264](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L264)

***

### displayValueMap \{#displayvaluemap\}

```ts
readonly displayValueMap: Signal<Map<string, string>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:309](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L309)

***

### editableFields \{#editablefields\}

```ts
readonly editableFields: Signal<FormFieldConfig[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:290](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L290)

***

### fieldChanged \{#fieldchanged\}

```ts
readonly fieldChanged: OutputEmitterRef<FormFieldChangeEvent>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L269)

***

### fields \{#fields\}

```ts
readonly fields: InputSignal<FormFieldConfig[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:263](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L263)

***

### formBinding \{#formbinding\}

```ts
readonly formBinding: InjectEntityFormReturn;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:275](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L275)

Input signals can only be read after component instantiation, so an empty controller is created first and the real inputs are synced by an effect.

***

### formCancelled \{#formcancelled\}

```ts
readonly formCancelled: OutputEmitterRef<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L271)

***

### formData \{#formdata\}

```ts
readonly formData: Signal<EntityFormData>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L288)

***

### formInputSync \{#forminputsync\}

```ts
readonly formInputSync: EffectRef;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:276](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L276)

***

### formSubmitted \{#formsubmitted\}

```ts
readonly formSubmitted: OutputEmitterRef<EntityFormData>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L270)

***

### initialData \{#initialdata\}

```ts
readonly initialData: Signal<EntityFormData>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:287](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L287)

***

### isReadonly \{#isreadonly\}

```ts
readonly isReadonly: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:294](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L294)

***

### mode \{#mode\}

```ts
readonly mode: InputSignal<FormMode>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:265](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L265)

***

### relatedEntityProvider \{#relatedentityprovider\}

```ts
readonly relatedEntityProvider: InputSignal<
  | RelatedEntityProvider
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L266)

***

### relatedItemsMap \{#relateditemsmap\}

```ts
readonly relatedItemsMap: Signal<Map<string, RelatedEntityItem[]>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:296](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L296)

***

### showActions \{#showactions\}

```ts
readonly showActions: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L267)

***

### validationErrors \{#validationerrors\}

```ts
readonly validationErrors: OutputEmitterRef<FormValidationResult>;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L272)

## Accessors

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L319)

##### Returns

(`key`, `params?`) => `string`

## Methods

### binaryToHex() \{#binarytohex\}

```ts
binaryToHex(value): string;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:457](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L457)

Echoes a byte sequence as a hex string

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`string`

***

### colorValue() \{#colorvalue\}

```ts
colorValue(field): string;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:445](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L445)

Color picker echo value: falls back to black for invalid or empty values

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`string`

***

### dateInputType() \{#dateinputtype\}

```ts
dateInputType(field): "time" | "date" | "datetime-local";
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:367](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L367)

Maps the display mode of the dateTime format to the native input type

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`"time"` \| `"date"` \| `"datetime-local"`

***

### datePipeFormat() \{#datepipeformat\}

```ts
datePipeFormat(field): string;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:377](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L377)

Maps the display mode of the dateTime format to a DatePipe format

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`string`

***

### enumOptionDisabled() \{#enumoptiondisabled\}

```ts
enumOptionDisabled(field, value): boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:426](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L426)

Values declared as disabled in options cannot be selected

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |
| `value` | `string` |

#### Returns

`boolean`

***

### enumOptionLabel() \{#enumoptionlabel\}

```ts
enumOptionLabel(field, value): string;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:421](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L421)

Display label for enum / multi-select values (falls back to the original value when there are no options)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |
| `value` | `string` |

#### Returns

`string`

***

### isFieldReadonly() \{#isfieldreadonly\}

```ts
isFieldReadonly(field): boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:345](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L345)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`boolean`

***

### isTextareaFormat() \{#istextareaformat\}

```ts
isTextareaFormat(field): boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:361](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L361)

Multiline text formats: renders a textarea

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`boolean`

***

### isWideField() \{#iswidefield\}

```ts
isWideField(field): boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L350)

Fields occupying two grid columns: json / keyValue / binary / multiline text formats / explicit span

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`boolean`

***

### multiSelected() \{#multiselected\}

```ts
multiSelected(field, value): boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:462](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L462)

Current selected state of the checkbox group (supports both array and comma-string storage forms)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |
| `value` | `string` |

#### Returns

`boolean`

***

### numericBounds() \{#numericbounds\}

```ts
numericBounds(field): object;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:387](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L387)

Value range constraints of numeric formats (min / max / step)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`object`

##### max?

```ts
max?: number;
```

##### min?

```ts
min?: number;
```

##### step?

```ts
step?: number;
```

***

### numericUnitLabel() \{#numericunitlabel\}

```ts
numericUnitLabel(field): string;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L407)

Unit annotation of numeric formats (currency code / percent sign / duration unit)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`string`

***

### onCancel() \{#oncancel\}

```ts
onCancel(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L340)

#### Returns

`void`

***

### onFieldChange() \{#onfieldchange\}

```ts
onFieldChange(field, rawValue): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:323](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L323)

Input that fails to parse is discarded immediately: errors are reported only via validationErrors, and submission still validates against the most recent valid value (published semantics).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |
| `rawValue` | `unknown` |

#### Returns

`void`

***

### onMultiSelectChange() \{#onmultiselectchange\}

```ts
onMultiSelectChange(
   field, 
   value, 
   checked
): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:474](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L474)

Checkbox group toggle: merges a new array and goes through the unified parsing pipeline

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |
| `value` | `string` |
| `checked` | `boolean` |

#### Returns

`void`

***

### onSubmit() \{#onsubmit\}

```ts
onSubmit(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:334](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L334)

#### Returns

`void`

***

### textInputType() \{#textinputtype\}

```ts
textInputType(field): string;
```

Defined in: [packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts:431](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.ts#L431)

Maps string formats to native input types

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) |

#### Returns

`string`
