# ModelEditorI18n

Defined in: [packages/rxdb-model/src/i18n.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L39)

Manages translation and subscriptions of open DOM editors.

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

Defined in: [packages/rxdb-model/src/i18n.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L65)

Binds a DOM property that must update immediately when the language changes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `element` | `HTMLElement` |
| `property` | `string` |
| `render` | () => `string` |

#### Returns

`void`

***

### bindValue() \{#bindvalue\}

```ts
bindValue(
   element, 
   property, 
   value
): void;
```

Defined in: [packages/rxdb-model/src/i18n.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L73)

Binds an already-formatted text back to the message key, preserving the semantics of the current error.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `element` | `HTMLElement` |
| `property` | `string` |
| `value` | `string` |

#### Returns

`void`

***

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb-model/src/i18n.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L79)

Unsubscribes and releases DOM references when the editor closes.

#### Returns

`void`

***

### start() \{#start\}

```ts
start(table): void;
```

Defined in: [packages/rxdb-model/src/i18n.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L46)

Subscribes to the owning table's runtime when the editor opens.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `table` | `unknown` |

#### Returns

`void`

***

### t() \{#t\}

```ts
t(key, params?): string;
```

Defined in: [packages/rxdb-model/src/i18n.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L58)

Reads the text in the current editor language.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `params?` | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`string`
