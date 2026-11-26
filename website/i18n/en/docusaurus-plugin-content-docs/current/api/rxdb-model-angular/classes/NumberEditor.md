# NumberEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:20

Number input editor

Pops up a fixed-position input box above the cell, validating in real time and showing a red error hint while typing.
Enter / Tab commits; Escape restores the original value; clicking outside commits, and on commit failure the original value is restored.
Supports integer / decimal / bigint modes, and can constrain the value range by min / max / step.

## Implements

- `IEditor`&lt;`unknown`&gt;

## Constructors

### Constructor

```ts
new NumberEditor(isInteger?, options?): NumberEditor;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:30

Creates a number editor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `isInteger?` | `boolean` | true for integer mode, false (default) for decimal mode |
| `options?` | [`NumberEditorOptions`](../interfaces/NumberEditorOptions.md) | Optional behavior configuration (bigint mode and value range constraints) |

#### Returns

`NumberEditor`

## Properties

### editorType \{#editortype\}

```ts
readonly editorType: string;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:23

VTable editor type identifier (the editor name registered with VTable)

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:40

Repositions the input box and the error hint overlay according to the new cell rectangle

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

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:34

Returns the current value (bigint in bigint mode), null when empty

#### Returns

`number` \| `bigint` \| `null`

#### Implementation of

`IEditor.getValue`

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(el): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:38

Determines whether the target element belongs to this editor (the input box or the error hint overlay)

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

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:36

Removes the input box and the hint overlay, unbinding the global click event

#### Returns

`void`

#### Implementation of

`IEditor.onEnd`

***

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:32

Creates and shows the input box and the error hint overlay, binding input validation and commit logic

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`unknown`&gt; |

#### Returns

`void`

#### Implementation of

`IEditor.onStart`
