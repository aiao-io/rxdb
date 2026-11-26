# RelationEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:13

Relation field search dropdown editor (oneToOne / manyToOne)

- Top search box: filters the selectable entity list in real time
- Keyboard navigation: ↑ ↓ moves the focus, Enter / click confirms, Escape cancels
- Null support: when nullable=true, the first list item is "(empty)"
- Stores the foreign key ID, displays the related entity's displayName

## Implements

- `IEditor`&lt;`string`&gt;

## Constructors

### Constructor

```ts
new RelationEditor(items?, nullable?): RelationEditor;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:23

Creates a relation dropdown editor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `items?` | \| [`RelatedEntityItem`](../interfaces/RelatedEntityItem.md)[] \| (() => [`RelatedEntityItem`](../interfaces/RelatedEntityItem.md)[]) | Candidate entity list, or a factory re-evaluated each time the editor opens |
| `nullable?` | `boolean` | Whether null is allowed; when true the first list item is "(empty)" |

#### Returns

`RelationEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: "relation-editor" = "relation-editor";
```

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:16

VTable editor type identifier (the editor name registered with VTable)

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:33

Repositions the overlay according to the new cell rectangle

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

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:29

Returns the currently selected related entity ID (empty string when none is selected)

#### Returns

`string`

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:31

Determines whether the target element is inside this editor overlay

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

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:27

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

Defined in: packages/rxdb-model/dist/entity-table/editors/relation-editor.d.ts:25

Pops up the search overlay, parses the candidate list, and binds keyboard and click events

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`string`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
