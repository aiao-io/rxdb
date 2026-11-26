# AdminLayoutProps

Defined in: [layout/admin-layout.tsx:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L15)

Props of [AdminLayout](../functions/AdminLayout.md).

## Properties

### brandIcon? \{#brandicon\}

```ts
readonly brandIcon?: ReactNode;
```

Defined in: [layout/admin-layout.tsx:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L25)

Brand icon (shown when there is no logo image).

---

### children \{#children\}

```ts
readonly children: ReactNode;
```

Defined in: [layout/admin-layout.tsx:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L21)

Route outlet.

---

### headerEnd? \{#headerend\}

```ts
readonly headerEnd?: ReactNode;
```

Defined in: [layout/admin-layout.tsx:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L31)

Extension content after the header widget area.

---

### headerStart? \{#headerstart\}

```ts
readonly headerStart?: ReactNode;
```

Defined in: [layout/admin-layout.tsx:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L29)

Extension content before the header widget area.

---

### menu \{#menu\}

```ts
readonly menu: readonly MenuNode<ReactNode>[];
```

Defined in: [layout/admin-layout.tsx:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L17)

Navigation menu.

---

### navigating? \{#navigating\}

```ts
readonly navigating?: boolean;
```

Defined in: [layout/admin-layout.tsx:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L23)

Navigation in progress (lazy-loaded routes, loaders), drives the top progress bar and loading overlay.

---

### renderMenuExtra? \{#rendermenuextra\}

```ts
readonly renderMenuExtra?: RenderMenuExtra;
```

Defined in: [layout/admin-layout.tsx:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L27)

Extra content on the right of menu items, such as count badges.

---

### url \{#url\}

```ts
readonly url: string;
```

Defined in: [layout/admin-layout.tsx:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/layout/admin-layout.tsx#L19)

Current route URL (path + query string); on route changes the shell syncs tabs, title, and breadcrumb from it.
