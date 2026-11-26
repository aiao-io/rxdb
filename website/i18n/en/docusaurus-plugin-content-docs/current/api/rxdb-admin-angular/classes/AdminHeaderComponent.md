# AdminHeaderComponent

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L28)

Header: menu toggle, brand (in header layout), horizontal menu, breadcrumb and widgets. Not rendered when content is maximized.

## Constructors

### Constructor

```ts
new AdminHeaderComponent(): AdminHeaderComponent;
```

#### Returns

`AdminHeaderComponent`

## Properties

### brandIcon \{#brandicon\}

```ts
readonly brandIcon: InputSignal<TemplateRef<unknown> | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L48)

Brand icon template.

***

### end \{#end\}

```ts
readonly end: InputSignal<TemplateRef<unknown> | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L54)

Template for extension content after the header widget area.

***

### expanded \{#expanded\}

```ts
protected readonly expanded: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L39)

***

### isDark \{#isdark\}

```ts
protected readonly isDark: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L34)

***

### layout \{#layout\}

```ts
protected readonly layout: Signal<LayoutState>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L31)

***

### menu \{#menu\}

```ts
readonly menu: InputSignal<readonly MenuNode<LucideIconInput>[]>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L45)

Menu tree (rendered as a horizontal menu in top navigation mode).

***

### Menu \{#menu-1\}

```ts
protected readonly Menu: typeof LucideMenu = LucideMenu;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L42)

***

### mobile \{#mobile\}

```ts
protected readonly mobile: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L35)

***

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L33)

***

### semiDark \{#semidark\}

```ts
protected readonly semiDark: Signal<string | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L36)

***

### shell \{#shell\}

```ts
protected readonly shell: AdminShell<LucideIconInput>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L29)

***

### start \{#start\}

```ts
readonly start: InputSignal<TemplateRef<unknown> | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L51)

Template for extension content before the header widget area.

***

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L30)

Translates shell text.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | Text key. |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

***

### ui \{#ui\}

```ts
protected readonly ui: Signal<ShellUiState>;
```

Defined in: [rxdb-admin-angular/src/layout/header.component.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/header.component.ts#L32)
