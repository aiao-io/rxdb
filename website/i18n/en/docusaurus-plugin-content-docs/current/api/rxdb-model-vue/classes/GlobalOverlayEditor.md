# GlobalOverlayEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:64

Abstract base class for global overlay list editors

Provides the common infrastructure; subclasses only need to care about content rendering and selection logic:
- fixed overlay on `document.body` + smart upward/downward flip positioning
- close on outside click, close on Escape
- keyboard navigation (↑ ↓ Enter)
- mouse hover highlight (auto-delegated via `data-idx`)
- `refocusTable` focus restoration

### Subclass implementation requirements
1. Declare `readonly editorType: string`
2. Implement `buildRows(panel)` — renders rows into the panel; rows must set `data-idx`
3. Implement `get itemCount()` — total row count
4. Implement `onRowClick(idx)` — triggered on click/Enter
5. Implement `onFocusChange(idx, prev)` — updates the rows' visual highlight
6. Implement `getValue()` — returns the final value

## Extended by

- [`EnumEditor`](EnumEditor.md)
- [`IconListEditor`](IconListEditor.md)
- [`MultiSelectEditor`](MultiSelectEditor.md)

## Implements

- `IEditor`&lt;`string`&gt;

## Constructors

### Constructor

```ts
new GlobalOverlayEditor(): GlobalOverlayEditor;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:79

Constructs the overlay editor base class (subclasses build the panel in onStart)

#### Returns

`GlobalOverlayEditor`

## Properties

### container \{#container\}

```ts
protected container: HTMLElement | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:67

***

### editCol \{#editcol\}

```ts
protected editCol: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:71

***

### editorType \{#editortype\}

```ts
abstract readonly editorType: string;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:77

VTable editor type identifier (the editor name registered with VTable, assigned by subclasses)

***

### editRow \{#editrow\}

```ts
protected editRow: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:72

***

### messages \{#messages\}

```ts
protected readonly messages: ModelEditorI18n;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:66

***

### table \{#table\}

```ts
protected table: 
  | {
  getCellOriginValue(col, row): unknown;
}
  | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:68

## Accessors

### focusedIndex \{#focusedindex\}

#### Get Signature

```ts
get protected focusedIndex(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:75

##### Returns

`number`

***

### initialFocusIndex \{#initialfocusindex\}

#### Get Signature

```ts
get abstract protected initialFocusIndex(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:73

##### Returns

`number`

***

### itemCount \{#itemcount\}

#### Get Signature

```ts
get abstract protected itemCount(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:74

##### Returns

`number`

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:89

Repositions the overlay panel to the new cell rectangle

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rect` | `RectProps` |

#### Returns

`void`

#### Implementation of

`IEditor.adjustPosition`

***

### buildRows() \{#buildrows\}

```ts
abstract protected buildRows(panel): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:90

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `panel` | `HTMLDivElement` |

#### Returns

`void`

***

### close() \{#close\}

```ts
protected close(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:96

#### Returns

`void`

***

### getValue() \{#getvalue\}

```ts
abstract getValue(): string;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:85

Returns the edited result value

#### Returns

`string`

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:87

Determines whether the target element belongs to the overlay panel

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | `HTMLElement` |

#### Returns

`boolean`

#### Implementation of

`IEditor.isEditorElement`

***

### onDeleteKey() \{#ondeletekey\}

```ts
protected onDeleteKey(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:95

#### Returns

`void`

***

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:83

Closes the overlay: removes the panel and unregisters global mouse/keyboard listeners

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

***

### onFocusChange() \{#onfocuschange\}

```ts
abstract protected onFocusChange(idx, prev): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:92

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |
| `prev` | `number` |

#### Returns

`void`

***

### onRowClick() \{#onrowclick\}

```ts
abstract protected onRowClick(idx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:91

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`void`

***

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:81

Opens the overlay: renders rows, positions the panel and registers global mouse/keyboard listeners

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`string`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`

***

### refocusTable() \{#refocustable\}

```ts
protected refocusTable(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:97

#### Returns

`void`

***

### rowAt() \{#rowat\}

```ts
protected rowAt(idx): HTMLElement | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:93

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`HTMLElement` \| `null`

***

### setFocused() \{#setfocused\}

```ts
protected setFocused(idx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:94

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`void`
