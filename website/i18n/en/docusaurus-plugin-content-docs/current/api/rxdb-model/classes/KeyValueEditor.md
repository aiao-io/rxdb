# KeyValueEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/key-value-editor.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/key-value-editor.ts#L24)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/key-value-editor.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/key-value-editor.ts#L45)

Creates a KeyValue editor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `schema?` | \| `Record`&lt;`string`, [`KVSchemaEntry`](../interfaces/KVSchemaEntry.md)&gt; \| `null` | Optional key schema definition; enters free mode when omitted or empty |

#### Returns

`KeyValueEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: "key-value-editor" = 'key-value-editor';
```

Defined in: [packages/rxdb-model/src/entity-table/editors/key-value-editor.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/key-value-editor.ts#L38)

VTable editor type identifier (the editor name registered with VTable)

## Methods

### getValue() \{#getvalue\}

```ts
getValue(): Record<string, unknown>;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/key-value-editor.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/key-value-editor.ts#L207)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/key-value-editor.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/key-value-editor.ts#L218)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/key-value-editor.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/key-value-editor.ts#L212)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/key-value-editor.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/key-value-editor.ts#L50)

Opens the editor: builds the key-value editing overlay and fills rows from the initial value / schema

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
