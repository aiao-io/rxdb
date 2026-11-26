# ModelEditorI18n

Defined in: packages/rxdb-model/dist/i18n.d.ts:25

Manages translations and subscriptions for open DOM editors.

## Constructors

### Constructor

```ts
new ModelEditorI18n(): ModelEditorI18n;
```

#### Returns

`ModelEditorI18n`

## Methods

### bind() \{#bind\}

```ts
bind(
   element,
   property,
   render
): void;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:32

Binds a DOM property that must update immediately when the language changes.

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `element`  | `HTMLElement`  |
| `property` | `string`       |
| `render`   | () => `string` |

#### Returns

`void`

---

### bindValue() \{#bindvalue\}

```ts
bindValue(
   element,
   property,
   value
): void;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:34

Binds already-formatted copy back to its message key, preserving the semantics of the current error.

#### Parameters

| Parameter  | Type          |
| ---------- | ------------- |
| `element`  | `HTMLElement` |
| `property` | `string`      |
| `value`    | `string`      |

#### Returns

`void`

---

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:36

Releases subscriptions and DOM references when the editor closes.

#### Returns

`void`

---

### start() \{#start\}

```ts
start(table): void;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:28

Subscribes to the owning table's runtime when the editor opens.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `table`   | `unknown` |

#### Returns

`void`

---

### t() \{#t\}

```ts
t(key, params?): string;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:30

Reads the copy for the current editor language.

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `key`     | `string`                            |
| `params?` | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`string`
