# ValueInputComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L223)

Value input component

## Description

Shows the appropriate input control based on the field type and operator:
- string: text input box
- number: number input box
- boolean: toggle switch
- date: date picker
- enum: dropdown selector
- array: comma-separated text input
- range: range input (two input boxes or a range picker)
- null/notNull operators: no input
- exists/notExists operators: subquery builder

## Implements

- `OnInit`
- `OnDestroy`

## Constructors

### Constructor

```ts
new ValueInputComponent(): ValueInputComponent;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L281)

#### Returns

`ValueInputComponent`

## Properties

### arrayInputValue \{#arrayinputvalue\}

```ts
readonly arrayInputValue: WritableSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:264](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L264)

***

### currentDateStr \{#currentdatestr\}

```ts
readonly currentDateStr: WritableSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:265](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L265)

***

### currentValue \{#currentvalue\}

```ts
readonly currentValue: WritableSignal<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L261)

Signal state — replaces the previous mutable class properties

***

### dateRangeEnd \{#daterangeend\}

```ts
readonly dateRangeEnd: WritableSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L267)

***

### dateRangeStart \{#daterangestart\}

```ts
readonly dateRangeStart: WritableSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L266)

***

### enumOptions \{#enumoptions\}

```ts
readonly enumOptions: InputSignal<unknown[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L245)

***

### enumSelectOptions \{#enumselectoptions\}

```ts
readonly enumSelectOptions: Signal<object[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L270)

***

### errorMessage \{#errormessage\}

```ts
readonly errorMessage: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L252)

***

### fieldType \{#fieldtype\}

```ts
readonly fieldType: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L242)

***

### hasError \{#haserror\}

```ts
readonly hasError: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L253)

***

### inputType \{#inputtype\}

```ts
readonly inputType: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L269)

***

### operator \{#operator\}

```ts
readonly operator: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:243](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L243)

***

### rangeMax \{#rangemax\}

```ts
readonly rangeMax: WritableSignal<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:263](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L263)

***

### rangeMin \{#rangemin\}

```ts
readonly rangeMin: WritableSignal<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:262](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L262)

***

### relationFields \{#relationfields\}

```ts
readonly relationFields: InputSignal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L246)

***

### subqueryContainer? \{#subquerycontainer\}

```ts
subqueryContainer?: ViewContainerRef;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L240)

***

### uuidError \{#uuiderror\}

```ts
readonly uuidError: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L233)

UUID format validation error (derived from currentValue; automatically empty when inputType is not uuid)

***

### value \{#value\}

```ts
readonly value: InputSignal<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:244](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L244)

***

### valueChange \{#valuechange\}

```ts
readonly valueChange: OutputEmitterRef<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L249)

***

### valueChangeFn \{#valuechangefn\}

```ts
readonly valueChangeFn: InputSignal<((value) => void) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:255](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L255)

***

### where \{#where\}

```ts
readonly where: InputSignal<
  | QueryBuilderRuleGroup<Record<string, unknown>>
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L247)

***

### whereChange \{#wherechange\}

```ts
readonly whereChange: OutputEmitterRef<
  | QueryBuilderRuleGroup<Record<string, unknown>>
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L250)

***

### whereChangeFn \{#wherechangefn\}

```ts
readonly whereChangeFn: InputSignal<((where) => void) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L256)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:277](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L277)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

***

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L274)

##### Returns

(`key`, `params?`) => `string`

## Methods

### handleWhereChange() \{#handlewherechange\}

```ts
handleWhereChange(where): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L447)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `where` | \| \{ `combinator`: `"and"` \| `"or"`; `rules`: `unknown`[]; \} \| `undefined` |

#### Returns

`void`

***

### isEnumSelected() \{#isenumselected\}

```ts
isEnumSelected(opt): boolean;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:372](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L372)

Whether the enum option is selected

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opt` | `unknown` |

#### Returns

`boolean`

***

### ngOnDestroy() \{#ngondestroy\}

```ts
ngOnDestroy(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L312)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

***

### ngOnInit() \{#ngoninit\}

```ts
ngOnInit(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:316](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L316)

A callback method that is invoked immediately after the
default change detector has checked the directive's
data-bound properties for the first time,
and before any of the view or content children have been checked.
It is invoked only once when the directive is instantiated.

#### Returns

`void`

#### Implementation of

`OnInit.ngOnInit`

***

### onArrayInputChange() \{#onarrayinputchange\}

```ts
onArrayInputChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:440](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L440)

Array input value change (comma-separated string)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onDateRangeEndChange() \{#ondaterangeendchange\}

```ts
onDateRangeEndChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:398](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L398)

Date range end change

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onDateRangePartChange() \{#ondaterangepartchange\}

```ts
onDateRangePartChange(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:403](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L403)

#### Returns

`void`

***

### onDateRangeStartChange() \{#ondaterangestartchange\}

```ts
onDateRangeStartChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:392](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L392)

Date range start change

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onEnumArrayChange() \{#onenumarraychange\}

```ts
onEnumArrayChange(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:363](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L363)

Enum multi-select change

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `Event` |

#### Returns

`void`

***

### onEnumSelect() \{#onenumselect\}

```ts
onEnumSelect(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L378)

Enum value selected (from PopoverSelectComponent)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onNativeDateChange() \{#onnativedatechange\}

```ts
onNativeDateChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:385](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L385)

Native date input change

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onNumberInputChange() \{#onnumberinputchange\}

```ts
onNumberInputChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:355](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L355)

Number input change

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onRangeChange() \{#onrangechange\}

```ts
onRangeChange(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:427](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L427)

#### Returns

`void`

***

### onRangeMaxChange() \{#onrangemaxchange\}

```ts
onRangeMaxChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:422](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L422)

Range max value change

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onRangeMinChange() \{#onrangeminchange\}

```ts
onRangeMinChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:416](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L416)

Range min value change

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onUuidChange() \{#onuuidchange\}

```ts
onUuidChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:347](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L347)

UUID value change (with format validation)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onValueChange() \{#onvaluechange\}

```ts
onValueChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/value-input/value-input.component.ts#L340)

Generic value change (string / boolean…)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`void`
