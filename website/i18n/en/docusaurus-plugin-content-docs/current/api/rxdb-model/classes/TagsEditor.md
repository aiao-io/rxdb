# TagsEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/tags-editor.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/tags-editor.ts#L21)

Tags (array) input editor

The overlay shows tag chips + an input box, suitable for editing stringArray / numberArray types.

- Enter or comma: add the current input as a new tag
- Backspace (when the input box is empty): remove the last tag
- Clicking ×: remove the corresponding tag
- Escape: cancel (restore the original tags)
- Click outside / Tab: commit the current input (if any) and close

In number mode (TagsMode='number') only valid numbers are accepted.

## Implements

- `IEditor`&lt;`unknown`&gt;

## Constructors

### Constructor

```ts
new TagsEditor(mode?): TagsEditor;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/tags-editor.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/tags-editor.ts#L40)

Creates a tags editor

#### Parameters

| Parameter | Type                                      | Default value | Description                               |
| --------- | ----------------------------------------- | ------------- | ----------------------------------------- |
| `mode?`   | [`TagsMode`](../type-aliases/TagsMode.md) | `'string'`    | Tags mode, 'string' (default) or 'number' |

#### Returns

`TagsEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: string;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/tags-editor.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/tags-editor.ts#L33)

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): string[] | number[];
```

Defined in: [packages/rxdb-model/src/entity-table/editors/tags-editor.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/tags-editor.ts#L158)

Returns the tags array; returns a number array in number mode

#### Returns

`string`[] \| `number`[]

#### Implementation of

`IEditor.getValue`

---

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/tags-editor.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/tags-editor.ts#L172)

Checks whether the target element is inside this editor's overlay

#### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `el`      | `HTMLElement` \| `EventTarget` |

#### Returns

`boolean`

#### Implementation of

`IEditor.isEditorElement`

---

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/tags-editor.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/tags-editor.ts#L166)

Removes the overlay and unbinds the global click events

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

---

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/tags-editor.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/tags-editor.ts#L46)

Pops up the tag editing overlay, parses the initial tags from the cell value, and binds interaction events

#### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `ctx`     | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
