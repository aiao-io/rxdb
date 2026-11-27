# AdminFooterComponent

Defined in: [rxdb-admin-angular/src/layout/footer.component.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/footer.component.ts#L13)

Footer: copyright information and ICP filing number. Not rendered when the layout does not show the footer.

## Constructors

### Constructor

```ts
new AdminFooterComponent(): AdminFooterComponent;
```

#### Returns

`AdminFooterComponent`

## Properties

### copyright \{#copyright\}

```ts
protected readonly copyright: Signal<{
  companyName: string;
  companySiteLink: string;
  date: string;
  enable: boolean;
  icp: string;
  icpLink: string;
}>;
```

Defined in: [rxdb-admin-angular/src/layout/footer.component.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/footer.component.ts#L19)

---

### copyrightText \{#copyrighttext\}

```ts
protected readonly copyrightText: Signal<string>;
```

Defined in: [rxdb-admin-angular/src/layout/footer.component.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/footer.component.ts#L20)

---

### icpHref \{#icphref\}

```ts
protected readonly icpHref: Signal<string | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/footer.component.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/footer.component.ts#L24)

---

### layout \{#layout\}

```ts
protected readonly layout: Signal<LayoutState>;
```

Defined in: [rxdb-admin-angular/src/layout/footer.component.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/footer.component.ts#L17)

---

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/layout/footer.component.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/footer.component.ts#L18)

---

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/layout/footer.component.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/footer.component.ts#L16)

Translates shell text.

#### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`
