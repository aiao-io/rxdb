# SafeListEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/safe-list-editor.d.ts:7

Workaround for VTable `ListEditor` bug:
`onEnd` throws TypeError when `element.parentNode` is null
during keyboard-triggered cell navigation.

## Extends

- `ListEditor`

## Constructors

### Constructor

```ts
new SafeListEditor(editorConfig): SafeListEditor;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:12

#### Parameters

| Parameter      | Type               |
| -------------- | ------------------ |
| `editorConfig` | `ListEditorConfig` |

#### Returns

`SafeListEditor`

#### Inherited from

`ListEditor.constructor`

## Properties

### container? \{#container\}

```ts
container?: HTMLElement;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:9

#### Inherited from

`ListEditor.container`

---

### editorConfig? \{#editorconfig\}

```ts
editorConfig?: ListEditorConfig;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:8

#### Inherited from

`ListEditor.editorConfig`

---

### editorType \{#editortype\}

```ts
editorType: string;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:6

#### Inherited from

`ListEditor.editorType`

---

### element? \{#element\}

```ts
element?: HTMLSelectElement;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:10

#### Inherited from

`ListEditor.element`

---

### input? \{#input\}

```ts
input?: HTMLInputElement;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:7

#### Inherited from

`ListEditor.input`

---

### successCallback? \{#successcallback\}

```ts
successCallback?: () => void;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:11

#### Returns

`void`

#### Inherited from

`ListEditor.successCallback`

## Methods

### \_bindSelectChangeEvent() \{#_bindselectchangeevent\}

```ts
_bindSelectChangeEvent(): void;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:14

#### Returns

`void`

#### Inherited from

`ListEditor._bindSelectChangeEvent`

---

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:18

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `rect`    | `RectProps` |

#### Returns

`void`

#### Inherited from

`ListEditor.adjustPosition`

---

### createElement() \{#createelement\}

```ts
createElement(value): void;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:13

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

#### Inherited from

`ListEditor.createElement`

---

### endEditing() \{#endediting\}

```ts
endEditing(): void;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:19

#### Returns

`void`

#### Inherited from

`ListEditor.endEditing`

---

### getValue() \{#getvalue\}

```ts
getValue(): string;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:16

#### Returns

`string`

#### Inherited from

`ListEditor.getValue`

---

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:21

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `target`  | `HTMLElement` |

#### Returns

`boolean`

#### Inherited from

`ListEditor.isEditorElement`

---

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/safe-list-editor.d.ts:9

Calls the parent onEnd, swallowing the TypeError caused by a null parentNode in keyboard navigation scenarios

#### Returns

`void`

#### Overrides

`ListEditor.onEnd`

---

### onStart() \{#onstart\}

```ts
onStart(__namedParameters): void;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:17

#### Parameters

| Parameter           | Type          |
| ------------------- | ------------- |
| `__namedParameters` | `EditContext` |

#### Returns

`void`

#### Inherited from

`ListEditor.onStart`

---

### setValue() \{#setvalue\}

```ts
setValue(value): void;
```

Defined in: node\_modules/.pnpm/@visactor+vtable-editors@1.26.8/node\_modules/@visactor/vtable-editors/cjs/list-editor.d.ts:15

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

#### Inherited from

`ListEditor.setValue`
