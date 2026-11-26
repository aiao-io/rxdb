# EntityDialogComponent

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L27)

Dialog shell component (used inside CDK Dialog): supports dragging (CdkDrag), 8-way resizing, and fullscreen toggle.

## Implements

- `AfterViewInit`

## Constructors

### Constructor

```ts
new EntityDialogComponent(): EntityDialogComponent;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L52)

#### Returns

`EntityDialogComponent`

## Properties

### closeRequested \{#closerequested\}

```ts
readonly closeRequested: OutputEmitterRef<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L40)

***

### isFullscreen \{#isfullscreen\}

```ts
readonly isFullscreen: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L42)

***

### isInDialog \{#isindialog\}

```ts
readonly isInDialog: boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L43)

***

### title \{#title\}

```ts
readonly title: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L39)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L48)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

***

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L45)

##### Returns

(`key`, `params?`) => `string`

## Methods

### close() \{#close\}

```ts
close(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L68)

#### Returns

`void`

***

### ngAfterViewInit() \{#ngafterviewinit\}

```ts
ngAfterViewInit(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L63)

A callback method that is invoked immediately after
Angular has completed initialization of a component's view.
It is invoked only once when the view is instantiated.

#### Returns

`void`

#### Implementation of

`AfterViewInit.ngAfterViewInit`

***

### startResize() \{#startresize\}

```ts
startResize(e, dir): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L107)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `MouseEvent` |
| `dir` | `string` |

#### Returns

`void`

***

### toggleFullscreen() \{#togglefullscreen\}

```ts
toggleFullscreen(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-dialog/entity-dialog.component.ts#L73)

#### Returns

`void`
