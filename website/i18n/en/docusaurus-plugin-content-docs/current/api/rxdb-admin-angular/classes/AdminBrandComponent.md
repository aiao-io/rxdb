# AdminBrandComponent

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L30)

Brand area: Logo image, icon and app name; clicking returns home. Not rendered when preferences hide the Logo.
Shows the `icon` template when there is no Logo image (`AdminLayoutComponent` forwards the `[brandIcon]` slot here).

## Constructors

### Constructor

```ts
new AdminBrandComponent(): AdminBrandComponent;
```

#### Returns

`AdminBrandComponent`

## Properties

### brandTitle \{#brandtitle\}

```ts
protected readonly brandTitle: Signal<string>;
```

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L35)

---

### icon \{#icon\}

```ts
readonly icon: InputSignal<TemplateRef<unknown> | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L41)

Icon template shown when there is no Logo image.

---

### logo \{#logo\}

```ts
protected readonly logo: Signal<{
  enable: boolean;
  showText: boolean;
  source: string;
}>;
```

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L33)

---

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L32)

---

### revision \{#revision\}

```ts
protected readonly revision: Signal<number>;
```

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L34)

---

### shell \{#shell\}

```ts
protected readonly shell: AdminShell<LucideIconInput>;
```

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L31)

## Methods

### go() \{#go\}

```ts
protected go(event): void;
```

Defined in: [rxdb-admin-angular/src/layout/brand.component.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/brand.component.ts#L43)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |

#### Returns

`void`
