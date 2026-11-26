# AdminLayoutComponent

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L73)

Admin shell layout: sidebar / header / tab bar / content area / footer, plus the preferences drawer, command palette, lock screen and watermark.
Layout mode, sizes and visibility are all driven by shell preferences; router-library-agnostic — the application only passes the current address and navigates in the `navigate` callback.

## Remarks

Content projection: the default `<ng-content>` is the page content (router outlet); named slots `[brandIcon]` (brand icon when there is no Logo image),
`[headerStart]` / `[headerEnd]` (extension content before / after the header widget area). Extra content on the right of menu items uses the `menuExtra` template input,
whose template context is the menu node (`let-node`).

**Refresh = remount**: React rebuilds the content area with `key={refreshKey}`; Angular cannot rebuild `<ng-content>` projected content,
so put the page content inside `*rxdbAdminPage` ([AdminPageDirective](AdminPageDirective.md)) and `shell.ui.refresh()` will destroy and rebuild that template instance.
When projecting content directly (without the directive), refresh only rebuilds the `.admin-page` container; **the projected content itself is not rebuilt**.

## Example

```html
<rxdb-admin-layout [menu]="menu" [navigating]="navigating()" [url]="url()">
  <svg [lucideIcon]="Database" brandIcon></svg>
  <router-outlet *rxdbAdminPage />
</rxdb-admin-layout>
```

## Constructors

### Constructor

```ts
new AdminLayoutComponent(): AdminLayoutComponent;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L107)

#### Returns

`AdminLayoutComponent`

## Properties

### layout \{#layout\}

```ts
protected readonly layout: Signal<LayoutState>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L81)

---

### menu \{#menu\}

```ts
readonly menu: InputSignal<readonly MenuNode<LucideIconInput>[]>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L96)

Navigation menu. Must be a stable reference (`computed` / field); creating a new array on every change detection would repeatedly trigger shell updates.

---

### menuExtra \{#menuextra\}

```ts
readonly menuExtra: InputSignal<MenuExtraTemplate | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L105)

Template for extra content on the right of menu items; the context is the menu node.

---

### mobile \{#mobile\}

```ts
protected readonly mobile: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L84)

---

### navigating \{#navigating\}

```ts
readonly navigating: InputSignal<boolean>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L102)

Navigation in progress (lazy-loaded routes, loaders), drives the top progress bar and loading overlay.

---

### pageTemplate \{#pagetemplate\}

```ts
protected readonly pageTemplate: Signal<AdminPageDirective | undefined>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L93)

---

### pageTitle \{#pagetitle\}

```ts
protected readonly pageTitle: Signal<string>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L87)

The brand name may be translated per the host catalog (`brand.titleKey`); reading the text revision recomputes after a language switch.

---

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L83)

---

### refreshKey \{#refreshkey\}

```ts
protected readonly refreshKey: Signal<number>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L92)

Refresh counter: on change, rebuilds the page container and the `*rxdbAdminPage` template instance.

---

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L80)

Translates shell text.

#### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

---

### textRevision \{#textrevision\}

```ts
protected readonly textRevision: Signal<number>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L85)

---

### ui \{#ui\}

```ts
protected readonly ui: Signal<ShellUiState>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L82)

---

### url \{#url\}

```ts
readonly url: InputSignal<string>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L99)

Current route address (path + query string); the shell syncs tabs, title and breadcrumb from it on route changes.

## Methods

### skipToContent() \{#skiptocontent\}

```ts
protected skipToContent(event): void;
```

Defined in: [rxdb-admin-angular/src/layout/admin-layout.component.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-layout.component.ts#L125)

Skip to main content: focuses the content area instead of following the `href="#layout-content"` navigation —
the `<base href>` of Angular applications resolves a plain anchor link to "root path + anchor", causing a full page navigation.

#### Parameters

| Parameter | Type    | Description  |
| --------- | ------- | ------------ |
| `event`   | `Event` | Click event. |

#### Returns

`void`
