# TagsEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/tags-editor.d.ts:16

Tags (array) input editor

The overlay shows tag chips + an input box, suitable for editing stringArray / numberArray types.

- Enter or comma: adds the current input as a new tag
- Backspace (when the input is empty): removes the last tag
- Clicking ×: removes the corresponding tag
- Escape: cancels (restores the original tags)
- Clicking outside / Tab: commits the current input (if any) and closes

In number mode (TagsMode='number') only valid numbers are accepted.

## Implements

- `IEditor`&lt;`unknown`&gt;

## Constructors

### Constructor

```ts
new TagsEditor(mode?): TagsEditor;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/tags-editor.d.ts:25

Creates a tags editor

#### Parameters

| Parameter | Type                                      | Description                               |
| --------- | ----------------------------------------- | ----------------------------------------- |
| `mode?`   | [`TagsMode`](../type-aliases/TagsMode.md) | Tags mode, 'string' (default) or 'number' |

#### Returns

`TagsEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: string;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/tags-editor.d.ts:19

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): string[] | number[];
```

Defined in: packages/rxdb-model/dist/entity-table/editors/tags-editor.d.ts:29

Returns the tags array; in number mode returns a number array

#### Returns

`string`[] \| `number`[]

#### Implementation of

`IEditor.getValue`

---

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/tags-editor.d.ts:33

Determines whether the target element is inside this editor's overlay

#### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `el`      | `EventTarget` \| `HTMLElement` |

#### Returns

`boolean`

#### Implementation of

`IEditor.isEditorElement`

---

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/tags-editor.d.ts:31

Removes the overlay and unbinds global click events

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

---

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/tags-editor.d.ts:27

Pops up the tags editing overlay, parses the initial tags from the cell value and binds interaction events

#### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `ctx`     | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
