# AdminHeaderMenuComponent

Defined in: [rxdb-admin-angular/src/layout/header-menu.component.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header-menu.component.ts#L20)

Horizontal menu of top navigation: groups expand children on hover, and the current page is highlighted.

## Constructors

### Constructor

```ts
new AdminHeaderMenuComponent(): AdminHeaderMenuComponent;
```

#### Returns

`AdminHeaderMenuComponent`

## Properties

### activeId \{#activeid\}

```ts
protected readonly activeId: Signal<string | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/header-menu.component.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header-menu.component.ts#L26)

---

### ChevronDown \{#chevrondown\}

```ts
protected readonly ChevronDown: typeof LucideChevronDown = LucideChevronDown;
```

Defined in: [rxdb-admin-angular/src/layout/header-menu.component.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header-menu.component.ts#L25)

---

### nodes \{#nodes\}

```ts
readonly nodes: InputSignal<readonly Node[]>;
```

Defined in: [rxdb-admin-angular/src/layout/header-menu.component.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header-menu.component.ts#L29)

Menu tree.

---

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/layout/header-menu.component.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header-menu.component.ts#L23)

Translates shell text.

#### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

---

### url \{#url\}

```ts
protected readonly url: Signal<string>;
```

Defined in: [rxdb-admin-angular/src/layout/header-menu.component.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header-menu.component.ts#L24)

## Methods

### go() \{#go\}

```ts
protected go(event, node): void;
```

Defined in: [rxdb-admin-angular/src/layout/header-menu.component.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header-menu.component.ts#L31)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |
| `node`    | `Node`       |

#### Returns

`void`
