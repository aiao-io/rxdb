# DateEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/date-editor.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/date-editor.ts#L15)

Date-time picker editor

Directly overlays the cell with a native datetime-local input.
- Enter / Tab: confirm
- Escape: cancel (restore the original value)
- Click outside: confirm and close
- The "clear" button: sets the value to null

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
readonly editorType: "date-editor" = 'date-editor';
```

Defined in: [packages/rxdb-model/src/entity-table/editors/date-editor.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/date-editor.ts#L24)

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): Date | null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/date-editor.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/date-editor.ts#L132)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/date-editor.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/date-editor.ts#L143)

Checks whether the target element belongs to the editor overlay

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

Defined in: [packages/rxdb-model/src/entity-table/editors/date-editor.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/date-editor.ts#L137)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/date-editor.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/date-editor.ts#L27)

Opens the editor: builds the overlay panel and initializes the native datetime-local input

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
