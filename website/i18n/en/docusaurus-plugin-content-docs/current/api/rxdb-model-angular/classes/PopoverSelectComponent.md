# PopoverSelectComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L107)

Dropdown select component based on the Popover API

## Description

Renders the option list using the browser's native Popover API, drawn in the top layer,
ensuring it is not clipped even inside `overflow: auto/hidden` containers.
Supports keyword filtering and keyboard navigation (↑↓ to move, Enter to select, Escape to close).
The first item is highlighted automatically when the popover opens, and the first result is also highlighted after searching.

## Constructors

### Constructor

```ts
new PopoverSelectComponent(): PopoverSelectComponent;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L149)

#### Returns

`PopoverSelectComponent`

## Properties

### activeIndex \{#activeindex\}

```ts
protected readonly activeIndex: WritableSignal<number>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L117)

***

### activeItemId \{#activeitemid\}

```ts
readonly activeItemId: Signal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L136)

***

### currentLabel \{#currentlabel\}

```ts
readonly currentLabel: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L126)

***

### filteredOptions \{#filteredoptions\}

```ts
readonly filteredOptions: Signal<readonly object[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L130)

***

### filterText \{#filtertext\}

```ts
protected readonly filterText: WritableSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L116)

***

### listId \{#listid\}

```ts
protected readonly listId: string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L115)

***

### minWidth \{#minwidth\}

```ts
readonly minWidth: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L122)

***

### options \{#options\}

```ts
readonly options: InputSignal<readonly object[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L119)

***

### placeholder \{#placeholder\}

```ts
readonly placeholder: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L121)

***

### selectChange \{#selectchange\}

```ts
readonly selectChange: OutputEmitterRef<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L124)

***

### selected \{#selected\}

```ts
readonly selected: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L120)

***

### uid \{#uid\}

```ts
protected readonly uid: string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L114)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L145)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

***

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L142)

##### Returns

(`key`, `params?`) => `string`

## Methods

### onBeforeToggle() \{#onbeforetoggle\}

```ts
onBeforeToggle(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L156)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `Event` |

#### Returns

`void`

***

### onKeydown() \{#onkeydown\}

```ts
onKeydown(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L171)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `KeyboardEvent` |

#### Returns

`void`

***

### onSelect() \{#onselect\}

```ts
onSelect(value): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L211)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`void`

***

### onToggle() \{#ontoggle\}

```ts
onToggle(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/popover-select/popover-select.component.ts#L164)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `Event` |

#### Returns

`void`
