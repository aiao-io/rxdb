# rxdb-admin-react

The React binding of `@aiao/rxdb-admin`: `AdminLayout` (sidebar / header / tab bar / content area / footer), preferences drawer, command palette, lock screen, and watermark. The shell is created by the application with `createAdminShell`; the components only render.

## Styles

The application needs to enable Tailwind and daisyUI itself. Import this package's Tailwind source registration and the shell style contract (the latter comes from the core package) in the style entry:

```css
@import 'tailwindcss';
@import '@aiao/rxdb-admin-react/tailwind.css';
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

```tsx
import { createAdminShell } from '@aiao/rxdb-admin';
import { AdminLayout, AdminShellProvider } from '@aiao/rxdb-admin-react';
import { Database } from 'lucide-react';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router-dom';

const shell = createAdminShell<ReactNode>({
  brand: { title: 'Workspace' },
  navigate: url => void router.navigate(url)
});
shell.attach(); // bind the browser before the first render: theme and layout variables are in place on the first frame

function Layout() {
  const location = useLocation();
  const navigation = useNavigation();
  return (
    <AdminLayout
      menu={menu}
      url={`${location.pathname}${location.search}`}
      navigating={navigation.state !== 'idle'}
      brandIcon={<Database size={16} />}
    >
      <Outlet />
    </AdminLayout>
  );
}

export const App = () => (
  <AdminShellProvider shell={shell}>
    <Layout />
  </AdminShellProvider>
);
```

`AdminShellProvider` binds the browser during mount (shortcuts, theme, layout variables, title); `attach` is idempotent. `AdminLayout` props:

| Property          | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `menu`            | `MenuNode<ReactNode>[]` navigation menu                                         |
| `url`             | Current URL (path + query string); tab / title sync on change                   |
| `children`        | Route outlet; the "Refresh" in the header's and tab's context menus remounts it |
| `navigating`      | Navigation in progress, drives the top progress bar and loading overlay         |
| `brandIcon`       | Brand icon when there is no logo image                                          |
| `renderMenuExtra` | Extra content on the right of menu items (badges, counts)                       |
| `headerStart/End` | Extension content before / after the header widget area                         |

## Hooks

- `useAdminShell()`: reads the nearest shell; throws when the Provider is missing.
- `useAdminStore(store)`: subscribes to any readable store exposed by the shell (`shell.preferences`, `shell.layout`, `shell.tabs`, …) and re-renders when the value changes.
- `useAdminText()`: the function that translates shell copy; re-renders when the language or catalog changes.

```tsx
const { extension } = useAdminStore(shell.preferences);
const pageSize = extension['searchPageSize'] as number;
```

## Other exports

`Sidebar` / `Brand`, `Header` / `HeaderMenu` / `Breadcrumb`, `Tabbar`, `HeaderWidgets`, `PreferencesDrawer`, `CommandPalette`, `LockScreen`, `Watermark`, `Footer`, `MenuTree` can all be used standalone to build a custom shell; `AdminLayout` is their default composition. The command palette, preferences drawer, and lock screen use the native `<dialog>`; focus trap, Esc, and background inertness are handled by the browser.

## Interfaces

| Interface                                                        | Description                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| [AdminLayoutProps](interfaces/AdminLayoutProps.md)               | Props of [AdminLayout](functions/AdminLayout.md).               |
| [AdminShellProviderProps](interfaces/AdminShellProviderProps.md) | Props of [AdminShellProvider](functions/AdminShellProvider.md). |
| [BrandProps](interfaces/BrandProps.md)                           | Props of [Brand](functions/Brand.md).                           |
| [HeaderProps](interfaces/HeaderProps.md)                         | Props of [Header](functions/Header.md).                         |
| [MenuTreeProps](interfaces/MenuTreeProps.md)                     | Props of [MenuTree](functions/MenuTree.md).                     |
| [SidebarProps](interfaces/SidebarProps.md)                       | Props of [Sidebar](functions/Sidebar.md).                       |

## Type Aliases

| Type Alias                                         | Description                                                |
| -------------------------------------------------- | ---------------------------------------------------------- |
| [RenderMenuExtra](type-aliases/RenderMenuExtra.md) | Extra content on the right of menu items (badges, counts). |

## Functions

| Function                                                | Description                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AdminLayout](functions/AdminLayout.md)                 | Admin shell layout: sidebar / header / tab bar / content area / footer, plus the preferences drawer, command palette, lock screen, and watermark. Layout mode, sizes, and visibility are all driven by shell preferences; router-agnostic — the application only needs to pass the current URL and navigate in the `navigate` callback. |
| [AdminShellProvider](functions/AdminShellProvider.md)   | Provides the shell to the subtree and binds the shell to the browser during mount (shortcuts, theme, layout variables, title). To avoid first-screen flicker, call `shell.attach()` before the first render; `attach` is idempotent.                                                                                                    |
| [Brand](functions/Brand.md)                             | Brand area: logo image, icon, and app name; clicking goes home.                                                                                                                                                                                                                                                                         |
| [Breadcrumb](functions/Breadcrumb.md)                   | Breadcrumb: the current page's path in the menu.                                                                                                                                                                                                                                                                                        |
| [CommandPalette](functions/CommandPalette.md)           | Command palette: aggregates menus, commands, and app-registered sources (such as full-text search); keyboard up/down selection, Enter to run. Rendered as a native modal `<dialog>`; the input is a combobox and the results are a listbox.                                                                                             |
| [Footer](functions/Footer.md)                           | Footer: copyright info and registration number.                                                                                                                                                                                                                                                                                         |
| [Header](functions/Header.md)                           | Header: menu toggle, brand (in header layout), horizontal menu, breadcrumb, and widgets.                                                                                                                                                                                                                                                |
| [HeaderMenu](functions/HeaderMenu.md)                   | Horizontal menu of the top navigation: hover a group to expand its children.                                                                                                                                                                                                                                                            |
| [HeaderWidgets](functions/HeaderWidgets.md)             | Header widget area: rendered in the preference-defined order and visibility.                                                                                                                                                                                                                                                            |
| [interceptNavigation](functions/interceptNavigation.md) | Plain left clicks are taken over by the shell as SPA navigation; clicks with modifier keys or the middle button stay with the browser (open in a new tab).                                                                                                                                                                              |
| [LockScreen](functions/LockScreen.md)                   | Lock screen: a modal `<dialog>` covering the UI that Esc cannot close; asks to set a password first when none is set; a forgotten password can be reset (data is unaffected).                                                                                                                                                           |
| [MenuTree](functions/MenuTree.md)                       | Sidebar menu tree: collapsible groups (accordion controlled by preferences), current page highlighted, flattened when collapsed to an icon rail.                                                                                                                                                                                        |
| [PreferencesDrawer](functions/PreferencesDrawer.md)     | Preferences drawer: five schema-driven tabs with reset / copy / import configuration in the footer. Rendered as a native modal `<dialog>`; focus trap, Esc, and background inertness are handled by the browser.                                                                                                                        |
| [Sidebar](functions/Sidebar.md)                         | Sidebar: brand, menu tree, collapse button, width drag; expands on hover when collapsed, a drawer on mobile.                                                                                                                                                                                                                            |
| [Tabbar](functions/Tabbar.md)                           | Tab bar: multiple tabs, pinning, drag / keyboard reordering, context menu, middle-click close, wheel horizontal scrolling.                                                                                                                                                                                                              |
| [useAdminShell](functions/useAdminShell.md)             | Reads the nearest shell.                                                                                                                                                                                                                                                                                                                |
| [useAdminStore](functions/useAdminStore.md)             | Subscribes to a shell store and returns the current snapshot; re-renders when the value changes.                                                                                                                                                                                                                                        |
| [useAdminText](functions/useAdminText.md)               | Translation function; re-renders when the language or catalog changes.                                                                                                                                                                                                                                                                  |
| [Watermark](functions/Watermark.md)                     | Watermark: a tiled rotated-text overlay that intercepts no interaction.                                                                                                                                                                                                                                                                 |
