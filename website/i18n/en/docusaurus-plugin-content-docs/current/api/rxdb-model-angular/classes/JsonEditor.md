# JsonEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/json-editor.d.ts:11

JSON / KeyValue editor

The overlay shows a textarea with syntax hints, suitable for editing json and keyValue types.
- Ctrl+Enter: validate and commit
- Escape: cancel (restore the original value)
- Click outside: best-effort commit (commits if the JSON is valid, otherwise keeps the original value)
- Shows JSON format errors in real time

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
readonly editorType: "json-editor" = "json-editor";
```

Defined in: packages/rxdb-model/dist/entity-table/editors/json-editor.d.ts:14

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/json-editor.d.ts:18

Returns the value currently being edited

#### Returns

`unknown`

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/json-editor.d.ts:22

Determines whether the target element belongs to the editor overlay

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `el` | `HTMLElement` \| `EventTarget` |

#### Returns

`boolean`

#### Implementation of

`IEditor.isEditorElement`

***

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/json-editor.d.ts:20

Ends editing: cleans up the overlay panel and event listeners

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

***

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/json-editor.d.ts:16

Opens the editor: builds the overlay textarea panel and initializes the original value

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
