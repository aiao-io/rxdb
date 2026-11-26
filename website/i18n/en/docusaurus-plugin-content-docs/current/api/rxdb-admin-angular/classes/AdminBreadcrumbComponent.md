# AdminBreadcrumbComponent

Defined in: [rxdb-admin-angular/src/layout/breadcrumb.component.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/breadcrumb.component.ts#L17)

Breadcrumb: the path of the current page in the menu. Not rendered when preferences hide it, when there is only one level that is required to be hidden, or when nothing matches.

## Constructors

### Constructor

```ts
new AdminBreadcrumbComponent(): AdminBreadcrumbComponent;
```

#### Returns

`AdminBreadcrumbComponent`

## Properties

### breadcrumb \{#breadcrumb\}

```ts
protected readonly breadcrumb: Signal<{
  enable: boolean;
  hideOnlyOne: boolean;
  showHome: boolean;
  showIcon: boolean;
  styleType: BreadcrumbStyle;
}>;
```

Defined in: [rxdb-admin-angular/src/layout/breadcrumb.component.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/breadcrumb.component.ts#L23)

---

### items \{#items\}

```ts
protected readonly items: Signal<BreadcrumbItem<LucideIconInput>[]>;
```

Defined in: [rxdb-admin-angular/src/layout/breadcrumb.component.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/breadcrumb.component.ts#L21)

---

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/layout/breadcrumb.component.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/breadcrumb.component.ts#L22)

---

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/layout/breadcrumb.component.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/breadcrumb.component.ts#L20)

Translates shell text.

#### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

---

### visible \{#visible\}

```ts
protected readonly visible: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/breadcrumb.component.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/breadcrumb.component.ts#L24)

## Methods

### go() \{#go\}

```ts
protected go(event, item): void;
```

Defined in: [rxdb-admin-angular/src/layout/breadcrumb.component.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/breadcrumb.component.ts#L30)

#### Parameters

| Parameter | Type                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| `event`   | `MouseEvent`                                                                               |
| `item`    | [`BreadcrumbItem`](../../rxdb-admin/interfaces/BreadcrumbItem.md)&lt;`LucideIconInput`&gt; |

#### Returns

`void`
