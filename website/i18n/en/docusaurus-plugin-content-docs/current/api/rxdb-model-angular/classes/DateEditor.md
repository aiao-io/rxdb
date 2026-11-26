# DateEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/date-editor.d.ts:11

Date-time picker editor

Shows a native datetime-local input box directly overlaying the cell.
- Enter / Tab: confirm
- Escape: cancel (restore the original value)
- Click outside: confirm and close
- "Clear" button: sets the value to null

## Implements

- `IEditor`&lt;`unknown`&gt;

## Constructors

### Constructor

```ts
new DateEditor(): DateEditor;
```

#### Returns

`DateEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: "date-editor" = "date-editor";
```

Defined in: packages/rxdb-model/dist/entity-table/editors/date-editor.d.ts:14

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): Date | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/date-editor.d.ts:18

Returns the currently selected date value

#### Returns

`Date` \| `null`

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/date-editor.d.ts:22

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

Defined in: packages/rxdb-model/dist/entity-table/editors/date-editor.d.ts:20

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

Defined in: packages/rxdb-model/dist/entity-table/editors/date-editor.d.ts:16

Opens the editor: builds the overlay panel and initializes the native datetime-local input

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
