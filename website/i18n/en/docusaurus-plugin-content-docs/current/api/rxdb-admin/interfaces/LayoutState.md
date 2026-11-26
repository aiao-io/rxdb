# LayoutState

Defined in: [layout/layout-state.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L16)

The derived layout; the three framework shells render by it and no longer decide on their own.

## Properties

### brandInHeader \{#brandinheader\}

```ts
readonly brandInHeader: boolean;
```

Defined in: [layout/layout-state.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L36)

The logo goes in the top bar (top navigation and top bar + sidebar) instead of the sidebar header.

---

### contentMaxWidth \{#contentmaxwidth\}

```ts
readonly contentMaxWidth: number | null;
```

Defined in: [layout/layout-state.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L50)

The content area's maximum width (px), `null` means unlimited.

---

### contentPadding \{#contentpadding\}

```ts
readonly contentPadding: object;
```

Defined in: [layout/layout-state.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L52)

The content area's padding on all four sides (px).

#### bottom

```ts
readonly bottom: number;
```

#### left

```ts
readonly left: number;
```

#### right

```ts
readonly right: number;
```

#### top

```ts
readonly top: number;
```

---

### footerFixed \{#footerfixed\}

```ts
readonly footerFixed: boolean;
```

Defined in: [layout/layout-state.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L46)

The footer is fixed to the bottom of the viewport.

---

### footerHeight \{#footerheight\}

```ts
readonly footerHeight: number;
```

Defined in: [layout/layout-state.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L48)

The footer height (px).

---

### headerHeight \{#headerheight\}

```ts
readonly headerHeight: number;
```

Defined in: [layout/layout-state.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L32)

The top bar height (px).

---

### headerMenu \{#headermenu\}

```ts
readonly headerMenu: boolean;
```

Defined in: [layout/layout-state.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L34)

The top bar renders a horizontal menu.

---

### mode \{#mode\}

```ts
readonly mode: LayoutMode;
```

Defined in: [layout/layout-state.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L18)

The effective layout mode (on mobile everything follows sidebar navigation, with the sidebar presented as a drawer).

---

### semiDarkHeader \{#semidarkheader\}

```ts
readonly semiDarkHeader: boolean;
```

Defined in: [layout/layout-state.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L61)

The top bar uses half-dark.

---

### semiDarkSidebar \{#semidarksidebar\}

```ts
readonly semiDarkSidebar: boolean;
```

Defined in: [layout/layout-state.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L59)

The sidebar uses half-dark.

---

### showBreadcrumb \{#showbreadcrumb\}

```ts
readonly showBreadcrumb: boolean;
```

Defined in: [layout/layout-state.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L40)

Whether to show the breadcrumb.

---

### showFooter \{#showfooter\}

```ts
readonly showFooter: boolean;
```

Defined in: [layout/layout-state.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L44)

Whether to show the footer.

---

### showHeader \{#showheader\}

```ts
readonly showHeader: boolean;
```

Defined in: [layout/layout-state.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L30)

Whether to render the top bar.

---

### showMenuToggle \{#showmenutoggle\}

```ts
readonly showMenuToggle: boolean;
```

Defined in: [layout/layout-state.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L38)

The top bar shows the menu toggle button.

---

### showSidebar \{#showsidebar\}

```ts
readonly showSidebar: boolean;
```

Defined in: [layout/layout-state.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L20)

Whether to render the sidebar.

---

### showTabbar \{#showtabbar\}

```ts
readonly showTabbar: boolean;
```

Defined in: [layout/layout-state.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L42)

Whether to show the tab bar.

---

### sidebarCollapsed \{#sidebarcollapsed\}

```ts
readonly sidebarCollapsed: boolean;
```

Defined in: [layout/layout-state.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L24)

The sidebar collapses into an icon rail (desktop only).

---

### sidebarDrawer \{#sidebardrawer\}

```ts
readonly sidebarDrawer: boolean;
```

Defined in: [layout/layout-state.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L22)

The sidebar is presented as a drawer (overlay).

---

### sidebarExpandedWidth \{#sidebarexpandedwidth\}

```ts
readonly sidebarExpandedWidth: number;
```

Defined in: [layout/layout-state.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L28)

The sidebar's expanded width (px), used by hover expansion and the drawer.

---

### sidebarWidth \{#sidebarwidth\}

```ts
readonly sidebarWidth: number;
```

Defined in: [layout/layout-state.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L26)

The sidebar's placeholder width (px): collapsed takes the collapsed width, a drawer takes none.
