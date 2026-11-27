---
sidebar_label: 'MenuNode⟨TIcon⟩'
---

# MenuNode`<TIcon>`

Defined in: [layout/menu.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L4)

A navigation menu node.

## Type Parameters

| Type Parameter                            | Default type |
| ----------------------------------------- | ------------ |
| <a id="type-parameter-ticon"></a> `TIcon` | `unknown`    |

## Properties

### children? \{#children\}

```ts
readonly children?: readonly MenuNode<TIcon>[];
```

Defined in: [layout/menu.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L14)

The child nodes.

---

### expanded? \{#expanded\}

```ts
readonly expanded?: boolean;
```

Defined in: [layout/menu.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L16)

Whether the group is initially expanded; the group containing the current page is always expanded.

---

### icon? \{#icon\}

```ts
readonly icon?: TIcon;
```

Defined in: [layout/menu.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L10)

The icon; its type is determined by the three framework bindings (React node, Vue component, Angular icon name, etc.).

---

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [layout/menu.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L6)

The unique identifier.

---

### label \{#label\}

```ts
readonly label: string;
```

Defined in: [layout/menu.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L8)

The display text.

---

### route? \{#route\}

```ts
readonly route?: string;
```

Defined in: [layout/menu.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L12)

The route URL; pure group nodes do not have one.

---

### testId? \{#testid\}

```ts
readonly testId?: string;
```

Defined in: [layout/menu.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L18)

The test identifier, rendered as `data-testid`.
