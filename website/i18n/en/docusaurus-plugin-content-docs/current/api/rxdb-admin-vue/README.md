# rxdb-admin-vue

The Vue 3 binding of `@aiao/rxdb-admin`: `AdminLayout` (sidebar / header / tab bar / content area / footer), preferences drawer, command palette, lock screen, and watermark. The shell is created by the application with `createAdminShell`; the components only render. The DOM structure, class names, and `data-testid` match the React / Angular bindings.

## Styles

The application needs to enable Tailwind and daisyUI itself. Import this package's Tailwind source registration and the shell style contract (the latter comes from the core package) in the style entry:

```css
@import 'tailwindcss';
@import '@aiao/rxdb-admin-vue/tailwind.css';
@import '@aiao/rxdb-admin/admin.css';

@plugin 'daisyui' {
  themes:
    light --default,
    dark --prefersdark,
    dracula;
}
```

The themes in `createAdminShell({ themes })` must match the daisyUI themes enabled here.

## Integration

Create the shell outside the components, and `attach()` it before mounting so the theme and layout variables are in place on the first frame:

```ts
// shell.ts
import { createAdminShell } from '@aiao/rxdb-admin';
import type { Component } from 'vue';
import { router } from './router';

export const shell = createAdminShell<Component>({
  brand: { title: 'Workspace' },
  navigate: url => void router.push(url)
});
```

```ts
// main.ts
import { shell } from './shell';

shell.attach();
createApp(App).use(router).mount('#app');
```

```vue
<script lang="ts" setup>
import { AdminLayout, AdminShellProvider } from '@aiao/rxdb-admin-vue';
import { Database } from '@lucide/vue';
import { useRoute } from 'vue-router';
import { menu } from './menu';
import { shell } from './shell';

const route = useRoute();
</script>

<template>
  <AdminShellProvider :shell="shell">
    <AdminLayout :menu="menu" :url="route.fullPath">
      <template #brand-icon><Database :size="16" /></template>
      <template #menu-extra="{ node }">
        <span class="badge badge-ghost badge-xs">{{ counts[node.id] }}</span>
      </template>
      <RouterView />
    </AdminLayout>
  </AdminShellProvider>
</template>
```

The menu is `MenuNode<Component>[]`; icons are `@lucide/vue` components (use `markRaw` or keep them at module scope — don't let Vue deeply proxy them).

`AdminShellProvider` binds the browser during mount (shortcuts, theme, layout variables, title); `attach` is idempotent. Its `shell` cannot be replaced during the component's lifetime; add a `key` to the Provider when a replacement is needed. **Do not put the shell into `ref()` / `reactive()`**: the shell is a class instance with `#private` fields, and a deep proxy cannot read private fields; use `shallowRef` or `markRaw` when reactive holding is needed.

## `AdminLayout`

| Property / Slot            | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `menu`                     | `MenuNode<Component>[]` navigation menu                 |
| `url`                      | Current URL (path + query string); tab / title sync on change |
| `navigating`               | Navigation in progress, drives the top progress bar and loading overlay |
| default slot               | Route outlet; the "Refresh" in the header's and tab's context menus remounts it |
| `brand-icon`               | Brand icon when there is no logo image                  |
| `menu-extra`               | Extra content on the right of menu items (badges, counts); scope parameter `{ node }` |
| `header-start`/`header-end`| Extension content before / after the header widget area |

## Composables

- `useAdminShell()`: reads the nearest shell; throws when the Provider is missing.
- `useAdminStore(store)`: subscribes to any readable store exposed by the shell (`shell.preferences`, `shell.layout`, `shell.tabs`, …), returns a read-only `ref`, and auto-unsubscribes when the component unmounts.
- `useAdminText()`: the function that translates shell copy; the template re-renders when the language or catalog changes.

```ts
const prefs = useAdminStore(shell.preferences);
const pageSize = computed(() => prefs.value.extension['searchPageSize'] as number);
```

## Other exports

`Sidebar` / `Brand`, `Header` / `HeaderMenu` / `Breadcrumb`, `Tabbar`, `HeaderWidgets`, `PreferencesDrawer`, `CommandPalette`, `LockScreen`, `Watermark`, `Footer`, `MenuTree` can all be used standalone to build a custom shell; `AdminLayout` is their default composition. The command palette, preferences drawer, and lock screen use the native `<dialog>`; focus trap, Esc, and background inertness are handled by the browser.

## Testing

When mounting with `@vue/test-utils`, don't pass the shell via `props` (VTU deep-proxies props and the shell's private fields become unreadable); provide it through a render function closure instead:

```ts
mount(defineComponent({ render: () => h(AdminShellProvider, { shell }, () => h(AdminLayout, { menu, url })) }));
```

`createTestShell` from `@aiao/rxdb-admin/testing` provides fake window / fake document that don't depend on the browser.

rxdb-admin-vue - Vue binding of the admin shell

Binds the headless core `@aiao/rxdb-admin`'s `AdminShell` as Vue components: the layout (sidebar / header / tab bar / footer), preferences drawer,
command palette, lock screen, and watermark. Naming, DOM structure, CSS class names, and `data-testid` match the React / Angular bindings; styles share
`@aiao/rxdb-admin/admin.css`. Menu icons are Vue components (`AdminShell<Component>`).

## Interfaces

| Interface | Description |
| ------ | ------ |
| [AdminLayoutProps](interfaces/AdminLayoutProps.md) | Props of [AdminLayout](variables/AdminShellProvider.md); the route outlet is the default slot, other extension points see the slot signatures. |
| [AdminShellProviderProps](interfaces/AdminShellProviderProps.md) | Props of [AdminShellProvider](variables/AdminShellProvider.md). |
| [HeaderProps](interfaces/HeaderProps.md) | Props of [Header](variables/AdminShellProvider.md); the brand icon and extension content go through the `brand-icon` / `start` / `end` slots. |
| [MenuTreeProps](interfaces/MenuTreeProps.md) | Props of [MenuTree](variables/AdminShellProvider.md); extra content on the right of menu items goes through the `extra` slot. |
| [SidebarProps](interfaces/SidebarProps.md) | Props of [Sidebar](variables/AdminShellProvider.md); the brand icon and menu item extras go through the `brand-icon` / `menu-extra` slots. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [BrandProps](type-aliases/BrandProps.md) | Props of [Brand](variables/AdminShellProvider.md): the Vue version has no props; the icon shown when there is no logo image goes through the `icon` slot. |
| [RenderMenuExtra](type-aliases/RenderMenuExtra.md) | Scoped slot signature for extra content on the right of menu items (badges, counts), corresponding to React's `renderMenuExtra`. On [AdminLayout](variables/AdminShellProvider.md) / [Sidebar](variables/AdminShellProvider.md) the slot is named `menu-extra`; on [MenuTree](variables/AdminShellProvider.md) it is `extra`. |

## Variables

| Variable | Description |
| ------ | ------ |
| [AdminShellProvider](variables/AdminShellProvider.md) | Provides the shell to the subtree and binds the shell to the browser during mount (shortcuts, theme, layout variables, title). |

## Functions

| Function | Description |
| ------ | ------ |
| [interceptNavigation](functions/interceptNavigation.md) | Plain left clicks are taken over by the shell as SPA navigation; clicks with modifier keys or the middle button stay with the browser (open in a new tab). |
| [useAdminShell](functions/useAdminShell.md) | Reads the nearest shell. |
| [useAdminStore](functions/useAdminStore.md) | Subscribes to a shell store and returns a read-only ref that updates with it; auto-unsubscribes when the component unmounts (scope released). The value is held in a `shallowRef`: snapshots in the store are immutable and need not — and should not — be deeply proxied by Vue (menu icons are component objects). |
| [useAdminText](functions/useAdminText.md) | Translation function; the template re-renders when the language or catalog changes: every call reads the copy revision, so render effects depend on it. |

## References

### AdminLayout \{#adminlayout\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### Brand \{#brand\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### Breadcrumb \{#breadcrumb\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### CommandPalette \{#commandpalette\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### Footer \{#footer\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### Header \{#header\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### HeaderMenu \{#headermenu\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### HeaderWidgets \{#headerwidgets\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### LockScreen \{#lockscreen\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### MenuTree \{#menutree\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### PreferencesDrawer \{#preferencesdrawer\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### Sidebar \{#sidebar\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### Tabbar \{#tabbar\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)

***

### Watermark \{#watermark\}

Renames and re-exports [AdminShellProvider](variables/AdminShellProvider.md)
