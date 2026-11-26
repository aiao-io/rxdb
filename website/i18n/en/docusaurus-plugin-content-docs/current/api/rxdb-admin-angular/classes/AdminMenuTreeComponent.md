# AdminMenuTreeComponent

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L46)

Sidebar menu tree: groups are collapsible (accordion driven by preferences), the current page is highlighted, and the tree flattens to an icon rail when collapsed.

## Remarks

Group expansion state is kept only inside the component: initially the group containing the current page and the `expanded` groups are open; afterwards, address changes open the group containing the current page,
and menu updates open newly-appeared `expanded` groups (old groups the user collapsed are not reopened).
Extra content on the right of menu items is provided through the `extra` template input, whose context is the menu node.

## Constructors

### Constructor

```ts
new AdminMenuTreeComponent(): AdminMenuTreeComponent;
```

#### Returns

`AdminMenuTreeComponent`

## Properties

### activeId \{#activeid\}

```ts
protected readonly activeId: Signal<string | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L51)

---

### extra \{#extra\}

```ts
readonly extra: InputSignal<MenuExtraTemplate | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L73)

Template for extra content on the right of menu items.

---

### nodes \{#nodes\}

```ts
readonly nodes: InputSignal<readonly Node[]>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L67)

Menu tree.

---

### open \{#open\}

```ts
protected readonly open: WritableSignal<ReadonlySet<string>>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L53)

---

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L50)

---

### rail \{#rail\}

```ts
readonly rail: InputSignal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L70)

Collapsed to an icon rail (only leaf icons are rendered).

---

### rails \{#rails\}

```ts
protected readonly rails: Signal<(Node | null)[]>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L52)

---

### url \{#url\}

```ts
protected readonly url: Signal<string>;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L49)

## Methods

### go() \{#go\}

```ts
protected go(event, node): void;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L75)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |
| `node`    | `Node`       |

#### Returns

`void`

---

### toggle() \{#toggle\}

```ts
protected toggle(
   event,
   id,
   siblings
): void;
```

Defined in: [rxdb-admin-angular/src/layout/menu-tree.component.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/menu-tree.component.ts#L79)

#### Parameters

| Parameter  | Type              |
| ---------- | ----------------- |
| `event`    | `Event`           |
| `id`       | `string`          |
| `siblings` | readonly `Node`[] |

#### Returns

`void`
