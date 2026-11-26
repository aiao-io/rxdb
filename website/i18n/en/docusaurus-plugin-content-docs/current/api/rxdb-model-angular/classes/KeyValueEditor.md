# KeyValueEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/key-value-editor.d.ts:12

KeyValue (`Record<string, unknown>`) editor — Schema mode only

- Key is always a dropdown derived from schema definition
- Value input type adapts to the key's schema type
- Per-row inline error hints; global summary shown at bottom
- Ctrl+Enter / confirm button: validate & commit
- Escape / cancel button: revert to original value

## Implements

- `IEditor`&lt;`unknown`&gt;

## Constructors

### Constructor

```ts
new KeyValueEditor(schema?): KeyValueEditor;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/key-value-editor.d.ts:21

Creates a KeyValue editor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `schema?` | \| `Record`&lt;`string`, [`KVSchemaEntry`](../interfaces/KVSchemaEntry.md)&gt; \| `null` | Optional key schema definition; free mode is used when omitted or empty |

#### Returns

`KeyValueEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: "key-value-editor" = "key-value-editor";
```

Defined in: packages/rxdb-model/dist/entity-table/editors/key-value-editor.d.ts:15

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): Record<string, unknown>;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/key-value-editor.d.ts:25

Returns the key-value object currently being edited

#### Returns

`Record`&lt;`string`, `unknown`&gt;

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/key-value-editor.d.ts:29

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

Defined in: packages/rxdb-model/dist/entity-table/editors/key-value-editor.d.ts:27

Ends editing: aborts pending listeners and cleans up the overlay

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

***

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/key-value-editor.d.ts:23

Opens the editor: builds the key-value editing overlay and fills rows from the initial value / Schema

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
