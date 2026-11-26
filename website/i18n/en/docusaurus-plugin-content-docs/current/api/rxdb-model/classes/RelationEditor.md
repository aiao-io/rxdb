# RelationEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L19)

Relation field search dropdown editor (oneToOne / manyToOne)

- Search box at the top: filters the selectable entity list in real time
- Keyboard navigation: ↑ ↓ moves focus, Enter / click confirms, Escape cancels
- Null support: when nullable=true the first item in the list is "(empty)"
- Stores the foreign key ID, displays the related entity's displayName

## Implements

- `IEditor`&lt;`string`&gt;

## Constructors

### Constructor

```ts
new RelationEditor(items?, nullable?): RelationEditor;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L47)

Creates a relation dropdown editor

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `items?` | \| [`RelatedEntityItem`](../interfaces/RelatedEntityItem.md)[] \| (() => [`RelatedEntityItem`](../interfaces/RelatedEntityItem.md)[]) | `[]` | Candidate entity list, or a factory function re-evaluated each time it opens |
| `nullable?` | `boolean` | `false` | Whether null is allowed; when true the first item in the list is "(empty)" |

#### Returns

`RelationEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: "relation-editor" = 'relation-editor';
```

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L39)

VTable editor type identifier (the editor name registered with VTable)

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L202)

Repositions the overlay to the new cell rectangle

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rect` | `RectProps` |

#### Returns

`void`

#### Implementation of

`IEditor.adjustPosition`

***

### getValue() \{#getvalue\}

```ts
getValue(): string;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L192)

Returns the currently selected related entity ID (empty string when nothing is selected)

#### Returns

`string`

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L197)

Checks whether the target element is inside this editor's overlay

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | `HTMLElement` |

#### Returns

`boolean`

#### Implementation of

`IEditor.isEditorElement`

***

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L179)

Removes the overlay and unbinds the global events

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

***

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/relation-editor.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/relation-editor.ts#L96)

Pops up the search overlay, parses the candidate list, and binds keyboard and click events

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`string`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
