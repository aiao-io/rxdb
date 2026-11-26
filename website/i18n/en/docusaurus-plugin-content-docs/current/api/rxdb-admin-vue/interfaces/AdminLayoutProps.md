# AdminLayoutProps

Defined in: [types.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/types.ts#L15)

Props of [AdminLayout](../variables/AdminShellProvider.md); the route outlet is the default slot, other extension points see the slot signatures.

## Properties

### menu \{#menu\}

```ts
readonly menu: readonly MenuNode<Component>[];
```

Defined in: [types.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/types.ts#L17)

Navigation menu.

---

### navigating? \{#navigating\}

```ts
readonly navigating?: boolean;
```

Defined in: [types.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/types.ts#L21)

Navigation in progress (lazy-loaded routes, loaders), drives the top progress bar and loading overlay.

---

### url \{#url\}

```ts
readonly url: string;
```

Defined in: [types.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/types.ts#L19)

Current route URL (path + query string); on route changes the shell syncs tabs, title, and breadcrumb from it.
