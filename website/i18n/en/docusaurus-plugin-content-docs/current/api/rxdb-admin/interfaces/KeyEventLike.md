# KeyEventLike

Defined in: [shortcuts/combo.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L7)

The minimal contract of a keyboard event, which `KeyboardEvent` naturally satisfies.

## Extended by

- [`ShortcutKeyboardEvent`](ShortcutKeyboardEvent.md)

## Properties

### altKey \{#altkey\}

```ts
readonly altKey: boolean;
```

Defined in: [shortcuts/combo.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L17)

Whether Alt (Option) is pressed.

---

### code \{#code\}

```ts
readonly code: string;
```

Defined in: [shortcuts/combo.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L11)

The physical key position.

---

### ctrlKey \{#ctrlkey\}

```ts
readonly ctrlKey: boolean;
```

Defined in: [shortcuts/combo.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L13)

Whether Ctrl is pressed.

---

### key \{#key\}

```ts
readonly key: string;
```

Defined in: [shortcuts/combo.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L9)

The produced character value.

---

### metaKey \{#metakey\}

```ts
readonly metaKey: boolean;
```

Defined in: [shortcuts/combo.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L15)

Whether Meta (Command / Windows) is pressed.

---

### shiftKey \{#shiftkey\}

```ts
readonly shiftKey: boolean;
```

Defined in: [shortcuts/combo.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L19)

Whether Shift is pressed.
