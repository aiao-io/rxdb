# AdminSidebarComponent

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L19)

Sidebar: brand, menu tree, collapse button, width drag; hover to expand when collapsed, a drawer on mobile. Not rendered when the layout does not need a sidebar.

## Constructors

### Constructor

```ts
new AdminSidebarComponent(): AdminSidebarComponent;
```

#### Returns

`AdminSidebarComponent`

## Properties

### brandIcon \{#brandicon\}

```ts
readonly brandIcon: InputSignal<TemplateRef<unknown> | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L40)

Brand icon template (shown when there is no Logo image).

***

### collapsed \{#collapsed\}

```ts
protected readonly collapsed: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L27)

***

### hoverExpanded \{#hoverexpanded\}

```ts
protected readonly hoverExpanded: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L28)

***

### isDark \{#isdark\}

```ts
protected readonly isDark: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L25)

***

### layout \{#layout\}

```ts
protected readonly layout: Signal<LayoutState>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L22)

***

### menu \{#menu\}

```ts
readonly menu: InputSignal<readonly MenuNode<LucideIconInput>[]>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L37)

Menu tree.

***

### menuExtra \{#menuextra\}

```ts
readonly menuExtra: InputSignal<MenuExtraTemplate | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L43)

Template for extra content on the right of menu items.

***

### mobile \{#mobile\}

```ts
protected readonly mobile: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L26)

***

### PanelLeftClose \{#panelleftclose\}

```ts
protected readonly PanelLeftClose: typeof LucidePanelLeftClose = LucidePanelLeftClose;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L33)

***

### PanelLeftOpen \{#panelleftopen\}

```ts
protected readonly PanelLeftOpen: typeof LucidePanelLeftOpen = LucidePanelLeftOpen;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L34)

***

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L24)

***

### rail \{#rail\}

```ts
protected readonly rail: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L29)

***

### semiDark \{#semidark\}

```ts
protected readonly semiDark: Signal<string | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L30)

***

### shell \{#shell\}

```ts
protected readonly shell: AdminShell<LucideIconInput>;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L20)

***

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L21)

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

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L23)

## Methods

### hoverIn() \{#hoverin\}

```ts
protected hoverIn(): void;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L45)

#### Returns

`void`

***

### hoverOut() \{#hoverout\}

```ts
protected hoverOut(): void;
```

Defined in: [rxdb-admin-angular/src/layout/sidebar.component.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/sidebar.component.ts#L49)

#### Returns

`void`
