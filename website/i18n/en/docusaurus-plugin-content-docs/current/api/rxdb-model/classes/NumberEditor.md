# NumberEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L31)

Number input editor

Pops up a fixed-position input box above the cell, validating in real time and showing a red error hint.
Enter / Tab commits; Escape restores the original value; clicking outside commits, and restores the original value when the commit fails.
Supports integer / decimal / bigint modes, and can constrain the value range with min / max / step.

## Implements

- `IEditor`&lt;`unknown`&gt;

## Constructors

### Constructor

```ts
new NumberEditor(isInteger?, options?): NumberEditor;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L55)

Creates a number editor

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `isInteger?` | `boolean` | `false` | true for integer mode, false (default) for decimal mode |
| `options?` | [`NumberEditorOptions`](../interfaces/NumberEditorOptions.md) | `{}` | Optional behavior config (bigint mode and range constraints) |

#### Returns

`NumberEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: string;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L47)

VTable editor type identifier (the editor name registered with VTable)

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L218)

Repositions the input box and the error hint overlay to the new cell rectangle

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
getValue(): number | bigint | null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L201)

Returns the current numeric value (bigint in bigint mode); null for an empty value

#### Returns

`number` \| `bigint` \| `null`

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L212)

Checks whether the target element belongs to this editor (the input box or the error hint overlay)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L206)

Removes the input box and the hint overlay, unbinding the global click events

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

***

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L68)

Creates and shows the input box and the error hint overlay, binding input validation and commit logic

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
