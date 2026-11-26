# ShortcutKeyboardEvent

Defined in: [shortcuts/registry.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L20)

A keyboard event that, in addition to the key information, must be able to prevent the default behavior.

## Extends

- [`KeyEventLike`](KeyEventLike.md)

## Properties

### altKey \{#altkey\}

```ts
readonly altKey: boolean;
```

Defined in: [shortcuts/combo.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L17)

Whether Alt (Option) is pressed.

#### Inherited from

[`KeyEventLike`](KeyEventLike.md).[`altKey`](KeyEventLike.md#altkey)

---

### code \{#code\}

```ts
readonly code: string;
```

Defined in: [shortcuts/combo.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L11)

The physical key position.

#### Inherited from

[`KeyEventLike`](KeyEventLike.md).[`code`](KeyEventLike.md#code)

---

### ctrlKey \{#ctrlkey\}

```ts
readonly ctrlKey: boolean;
```

Defined in: [shortcuts/combo.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L13)

Whether Ctrl is pressed.

#### Inherited from

[`KeyEventLike`](KeyEventLike.md).[`ctrlKey`](KeyEventLike.md#ctrlkey)

---

### isComposing? \{#iscomposing\}

```ts
readonly isComposing?: boolean;
```

Defined in: [shortcuts/registry.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L24)

An input-method composition is in progress.

---

### key \{#key\}

```ts
readonly key: string;
```

Defined in: [shortcuts/combo.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L9)

The produced character value.

#### Inherited from

[`KeyEventLike`](KeyEventLike.md).[`key`](KeyEventLike.md#key)

---

### metaKey \{#metakey\}

```ts
readonly metaKey: boolean;
```

Defined in: [shortcuts/combo.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L15)

Whether Meta (Command / Windows) is pressed.

#### Inherited from

[`KeyEventLike`](KeyEventLike.md).[`metaKey`](KeyEventLike.md#metakey)

---

### repeat? \{#repeat\}

```ts
readonly repeat?: boolean;
```

Defined in: [shortcuts/registry.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L26)

Triggers repeatedly while the key is held down.

---

### shiftKey \{#shiftkey\}

```ts
readonly shiftKey: boolean;
```

Defined in: [shortcuts/combo.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L19)

Whether Shift is pressed.

#### Inherited from

[`KeyEventLike`](KeyEventLike.md).[`shiftKey`](KeyEventLike.md#shiftkey)

---

### target? \{#target\}

```ts
readonly target?: unknown;
```

Defined in: [shortcuts/registry.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L22)

The event target, used to determine whether the user is currently typing.

## Methods

### preventDefault() \{#preventdefault\}

```ts
preventDefault(): void;
```

Defined in: [shortcuts/registry.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L28)

Prevents the browser's default behavior.

#### Returns

`void`
