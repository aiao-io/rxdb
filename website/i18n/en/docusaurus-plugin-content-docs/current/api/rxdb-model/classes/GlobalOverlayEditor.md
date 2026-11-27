# GlobalOverlayEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L92)

Abstract base class for global overlay list editors

Provides common infrastructure; subclasses only need to focus on content rendering and selection logic:

- Fixed overlay on `document.body` + smart up/down flip positioning
- Close on outside click, close on Escape
- Keyboard navigation (↑ ↓ Enter)
- Mouse hover highlight (auto-delegated via `data-idx`)
- `refocusTable` focus restoration

### Subclass implementation requirements

1. Declare `readonly editorType: string`
2. Implement `buildRows(panel)` — renders rows into the panel; rows must set `data-idx`
3. Implement `get itemCount()` — the total row count
4. Implement `onRowClick(idx)` — triggered by click/Enter
5. Implement `onFocusChange(idx, prev)` — updates the visual row highlight
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

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L118)

Constructs the overlay editor base class (subclasses build the panel in onStart)

#### Returns

`GlobalOverlayEditor`

## Properties

### container \{#container\}

```ts
protected container: HTMLElement | null = null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L102)

---

### editCol \{#editcol\}

```ts
protected editCol: number = 0;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L104)

---

### editorType \{#editortype\}

```ts
abstract readonly editorType: string;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L115)

VTable editor type identifier (the editor name registered with VTable, assigned by subclasses)

---

### editRow \{#editrow\}

```ts
protected editRow: number = 0;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L105)

---

### messages \{#messages\}

```ts
protected readonly messages: ModelEditorI18n;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L100)

---

### table \{#table\}

```ts
protected table:
  | {
  getCellOriginValue(col, row): unknown;
}
  | null = null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L103)

## Accessors

### focusedIndex \{#focusedindex\}

#### Get Signature

```ts
get protected focusedIndex(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L110)

##### Returns

`number`

---

### initialFocusIndex \{#initialfocusindex\}

#### Get Signature

```ts
get abstract protected initialFocusIndex(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L107)

##### Returns

`number`

---

### itemCount \{#itemcount\}

#### Get Signature

```ts
get abstract protected itemCount(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L108)

##### Returns

`number`

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L212)

Repositions the overlay panel to the new cell rectangle

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `rect`    | `RectProps` |

#### Returns

`void`

#### Implementation of

`IEditor.adjustPosition`

---

### buildRows() \{#buildrows\}

```ts
abstract protected buildRows(panel): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L216)

#### Parameters

| Parameter | Type             |
| --------- | ---------------- |
| `panel`   | `HTMLDivElement` |

#### Returns

`void`

---

### close() \{#close\}

```ts
protected close(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L235)

#### Returns

`void`

---

### getValue() \{#getvalue\}

```ts
abstract getValue(): string;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L204)

Returns the editing result value

#### Returns

`string`

#### Implementation of

`IEditor.getValue`

---

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L207)

Checks whether the target element belongs to the overlay panel

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `target`  | `HTMLElement` |

#### Returns

`boolean`

#### Implementation of

`IEditor.isEditorElement`

---

### onDeleteKey() \{#ondeletekey\}

```ts
protected onDeleteKey(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L231)

#### Returns

`void`

---

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L192)

Closes the overlay: removes the panel and unregisters the global mouse/keyboard listeners

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

---

### onFocusChange() \{#onfocuschange\}

```ts
abstract protected onFocusChange(idx, prev): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L218)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |
| `prev`    | `number` |

#### Returns

`void`

---

### onRowClick() \{#onrowclick\}

```ts
abstract protected onRowClick(idx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L217)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |

#### Returns

`void`

---

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L156)

Opens the overlay: renders rows, positions the panel, and registers global mouse/keyboard listeners

#### Parameters

| Parameter | Type                          |
| --------- | ----------------------------- |
| `ctx`     | `EditContext`&lt;`string`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`

---

### refocusTable() \{#refocustable\}

```ts
protected refocusTable(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L240)

#### Returns

`void`

---

### rowAt() \{#rowat\}

```ts
protected rowAt(idx): HTMLElement | null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L220)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |

#### Returns

`HTMLElement` \| `null`

---

### setFocused() \{#setfocused\}

```ts
protected setFocused(idx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L224)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |

#### Returns

`void`
