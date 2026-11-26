# ~~Class: IconListEditor~~

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L28)

Single-select list editor with icon + text support

## Deprecated

Use `EnumEditor` instead, passing an array of `EnumItem` with `icon` / `color` fields.
`IconListEditor` will be removed in a future version.

Each item contains a lucide SVG icon and a localized label.
↑ ↓ moves focus, Enter / click selects and closes, Esc cancels.

## Extends

- [`GlobalOverlayEditor`](GlobalOverlayEditor.md)

## Constructors

### Constructor

```ts
new IconListEditor(config): IconListEditor;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L48)

Creates an icon list editor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | \{ `values`: [`IconLabeledItem`](../interfaces/IconLabeledItem.md)[]; \} | Editor config (values is the item list) |
| `config.values` | [`IconLabeledItem`](../interfaces/IconLabeledItem.md)[] | - |

#### Returns

`IconListEditor`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`constructor`](GlobalOverlayEditor.md#constructor)

## Properties

### ~~container~~ \{#container\}

```ts
protected container: HTMLElement | null = null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L102)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`container`](GlobalOverlayEditor.md#container)

***

### ~~editCol~~ \{#editcol\}

```ts
protected editCol: number = 0;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L104)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editCol`](GlobalOverlayEditor.md#editcol)

***

### ~~editorType~~ \{#editortype\}

```ts
readonly editorType: "icon-list" = 'icon-list';
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L41)

VTable editor type identifier (the editor name registered with VTable)

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editorType`](GlobalOverlayEditor.md#editortype)

***

### ~~editRow~~ \{#editrow\}

```ts
protected editRow: number = 0;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L105)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editRow`](GlobalOverlayEditor.md#editrow)

***

### ~~messages~~ \{#messages\}

```ts
protected readonly messages: ModelEditorI18n;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L100)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`messages`](GlobalOverlayEditor.md#messages)

***

### ~~table~~ \{#table\}

```ts
protected table: 
  | {
  getCellOriginValue(col, row): unknown;
}
  | null = null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L103)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`table`](GlobalOverlayEditor.md#table)

## Accessors

### ~~focusedIndex~~ \{#focusedindex\}

#### Get Signature

```ts
get protected focusedIndex(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L110)

##### Returns

`number`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`focusedIndex`](GlobalOverlayEditor.md#focusedindex)

***

### ~~initialFocusIndex~~ \{#initialfocusindex\}

#### Get Signature

```ts
get protected initialFocusIndex(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L32)

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`initialFocusIndex`](GlobalOverlayEditor.md#initialfocusindex)

***

### ~~itemCount~~ \{#itemcount\}

#### Get Signature

```ts
get protected itemCount(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L36)

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`itemCount`](GlobalOverlayEditor.md#itemcount)

## Methods

### ~~adjustPosition()~~ \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L212)

Repositions the overlay panel to the new cell rectangle

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rect` | `RectProps` |

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`adjustPosition`](GlobalOverlayEditor.md#adjustposition)

***

### ~~buildRows()~~ \{#buildrows\}

```ts
protected buildRows(panel): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L77)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `panel` | `HTMLDivElement` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`buildRows`](GlobalOverlayEditor.md#buildrows)

***

### ~~close()~~ \{#close\}

```ts
protected close(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L235)

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`close`](GlobalOverlayEditor.md#close)

***

### ~~getValue()~~ \{#getvalue\}

```ts
getValue(): string;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L68)

Returns the value of the currently selected item

#### Returns

`string`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`getValue`](GlobalOverlayEditor.md#getvalue)

***

### ~~isEditorElement()~~ \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L207)

Checks whether the target element belongs to the overlay panel

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | `HTMLElement` |

#### Returns

`boolean`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`isEditorElement`](GlobalOverlayEditor.md#iseditorelement)

***

### ~~onDeleteKey()~~ \{#ondeletekey\}

```ts
protected onDeleteKey(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L72)

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onDeleteKey`](GlobalOverlayEditor.md#ondeletekey)

***

### ~~onEnd()~~ \{#onend\}

```ts
onEnd(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L192)

Closes the overlay: removes the panel and unregisters the global mouse/keyboard listeners

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onEnd`](GlobalOverlayEditor.md#onend)

***

### ~~onFocusChange()~~ \{#onfocuschange\}

```ts
protected onFocusChange(idx, prev): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L121)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |
| `prev` | `number` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onFocusChange`](GlobalOverlayEditor.md#onfocuschange)

***

### ~~onRowClick()~~ \{#onrowclick\}

```ts
protected onRowClick(idx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L114)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onRowClick`](GlobalOverlayEditor.md#onrowclick)

***

### ~~onStart()~~ \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/icon-list-editor.ts#L54)

Initializes editing: parses the current value; falls back to the cell's original value when it is not in the candidate list

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`string`, `any`&gt; |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onStart`](GlobalOverlayEditor.md#onstart)

***

### ~~refocusTable()~~ \{#refocustable\}

```ts
protected refocusTable(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L240)

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`refocusTable`](GlobalOverlayEditor.md#refocustable)

***

### ~~rowAt()~~ \{#rowat\}

```ts
protected rowAt(idx): HTMLElement | null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L220)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`HTMLElement` \| `null`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`rowAt`](GlobalOverlayEditor.md#rowat)

***

### ~~setFocused()~~ \{#setfocused\}

```ts
protected setFocused(idx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L224)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`setFocused`](GlobalOverlayEditor.md#setfocused)
