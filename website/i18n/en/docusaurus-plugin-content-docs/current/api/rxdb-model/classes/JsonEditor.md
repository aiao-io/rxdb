# JsonEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/json-editor.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/json-editor.ts#L15)

JSON / KeyValue editor

The overlay shows a textarea with syntax hints, suitable for editing json and keyValue types.

- Ctrl+Enter: validate and commit
- Escape: cancel (restore the original value)
- Click outside: best-effort commit (commit if the JSON is valid, otherwise keep the original value)
- JSON format errors shown in real time

## Implements

- `IEditor`&lt;`unknown`&gt;

## Constructors

### Constructor

```ts
new JsonEditor(): JsonEditor;
```

#### Returns

`JsonEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: "json-editor" = 'json-editor';
```

Defined in: [packages/rxdb-model/src/entity-table/editors/json-editor.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/json-editor.ts#L26)

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): unknown;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/json-editor.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/json-editor.ts#L160)

Returns the value currently being edited

#### Returns

`unknown`

#### Implementation of

`IEditor.getValue`

---

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/json-editor.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/json-editor.ts#L171)

Checks whether the target element belongs to the editor overlay

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

Defined in: [packages/rxdb-model/src/entity-table/editors/json-editor.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/json-editor.ts#L165)

Ends editing: cleans up the overlay panel and event listeners

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

---

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/json-editor.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/json-editor.ts#L29)

Opens the editor: builds the overlay textarea panel and initializes the original value

#### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `ctx`     | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
