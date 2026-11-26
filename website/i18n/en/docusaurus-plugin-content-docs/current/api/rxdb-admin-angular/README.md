# rxdb-admin-angular

Angular binding of `@aiao/rxdb-admin`: `rxdb-admin-layout` (sidebar / header / tab bar / content area / footer), the preferences drawer, the command palette, the lock screen and the watermark. All are standalone components, `OnPush` + signals, with zero zone dependencies; the DOM structure, class names and `data-testid` match the React / Vue bindings.

## Styles

The application needs to enable Tailwind and daisyUI itself. Import this package's Tailwind source registration and the shell style contract (the latter comes from the core package) in the style entry:

```css
@import 'tailwindcss';
@import '@aiao/rxdb-admin-angular/tailwind.css';
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

When creating the shell, use `AdminIcon` (the icon input of `@lucide/angular`) as the icon type, and put `provideAdminShell(shell)` into the application's providers. It binds the browser during environment initialization (before any component renders), so the theme and layout variables are in place on the first frame, and unbinds when the injector is destroyed:

```ts
import { createAdminShell } from '@aiao/rxdb-admin';
import { provideAdminShell, type AdminIcon } from '@aiao/rxdb-admin-angular';

export const shell = createAdminShell<AdminIcon>({
  brand: { title: 'Workspace' },
  navigate: url => void router.navigateByUrl(url)
});

bootstrapApplication(App, { providers: [provideZonelessChangeDetection(), provideAdminShell(shell)] });
```

```ts
@Component({
  selector: 'app-root',
  imports: [AdminLayoutComponent, AdminPageDirective, LucideDynamicIcon, RouterOutlet],
  template: `
    <rxdb-admin-layout [menu]="menu" [menuExtra]="extra" [navigating]="navigating()" [url]="url()">
      <svg [lucideIcon]="Database" [size]="16" brandIcon></svg>
      <router-outlet *rxdbAdminPage />
    </rxdb-admin-layout>
    <ng-template #extra let-node><span class="badge badge-ghost badge-xs">0</span></ng-template>
  `
})
export class App {
  readonly menu = MENU; // Stable reference: creating a new array on every change detection would repeatedly trigger shell updates
  readonly Database = LucideDatabase;
  readonly url = signal('/');
  readonly navigating = signal(false);
}
```

## `rxdb-admin-layout`

| Input / projection            | Description                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `menu`                        | `MenuNode<AdminIcon>[]` navigation menu; must be a stable reference                     |
| `url`                         | Current address (path + query string); tabs / title sync on change                      |
| `navigating`                  | Navigation in progress, drives the top progress bar and loading overlay                 |
| `menuExtra`                   | `TemplateRef` for extra content on the right of menu items; `let-node` is the menu node |
| Default projection            | Page content; see "Refresh" below                                                       |
| `[brandIcon]`                 | Brand icon when there is no Logo image                                                  |
| `[headerStart]`/`[headerEnd]` | Extension content before / after the header widget area                                 |

**Refresh = remount.** The "Refresh" item in the header and tab context menus must recreate the page content, but Angular's `<ng-content>` projected content belongs to the parent view, so the layout cannot rebuild it. Put the page content inside `*rxdbAdminPage` (like the `<router-outlet *rxdbAdminPage />` example above), and the layout instantiates it as a template: on refresh the old instance is destroyed and a new one is created. When projecting content directly (without the directive), refresh only rebuilds the `.admin-page` container; the projected content itself is not rebuilt.

The "Skip to main content" link focuses the content area instead of following `href="#layout-content"`: the `<base href>` of Angular applications resolves a plain anchor to "root path + anchor", causing a full page navigation.

## Injection functions

Must be called in an injection context (constructor or field initializer):

- `injectAdminShell()`: reads the nearest shell, throws when `provideAdminShell` is missing.
- `injectAdminStore(store)`: bridges any readable store exposed by the shell into a `Signal` (`shell.preferences`, `shell.layout`, `shell.tabs`…), unsubscribing when the current injection context is destroyed.
- `injectAdminText()`: the function that translates shell text; calling it in a template, `computed` or `effect` establishes a signal dependency on the text revision, so `OnPush` components also re-render after a language switch.

```ts
readonly prefs = injectAdminStore(shell.preferences);
readonly pageSize = computed(() => this.prefs().extension['searchPageSize'] as number);
```

`shell.attach()` is idempotent but not counted: with the same shell `provideAdminShell`ed in multiple injectors, destroying any one injector unbinds everything.

## Other exports

`AdminSidebarComponent` / `AdminBrandComponent`, `AdminHeaderComponent` / `AdminHeaderMenuComponent` / `AdminBreadcrumbComponent`, `AdminTabbarComponent`, `AdminHeaderWidgetsComponent`, `AdminPreferencesDrawerComponent`, `AdminCommandPaletteComponent`, `AdminLockScreenComponent`, `AdminWatermarkComponent`, `AdminFooterComponent`, `AdminMenuTreeComponent` can all be used standalone to build a custom shell; `AdminLayoutComponent` is their default composition. The command palette, preferences drawer and lock screen use the native `<dialog>`; focus trap, Esc and backdrop inertness are handled by the browser.

RxDB Admin Angular - Angular binding of the admin shell
Layout (sidebar / header / tab bar / content area / footer), preferences drawer, command palette, lock screen and watermark,
all driven by the `@aiao/rxdb-admin` shell runtime; same functionality and same DOM contract as the React / Vue bindings (shared `admin.css`).

## Classes

| Class                                                                         | Description                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AdminBrandComponent](classes/AdminBrandComponent.md)                         | Brand area: Logo image, icon and app name; clicking returns home. Not rendered when preferences hide the Logo. Shows the `icon` template when there is no Logo image (`AdminLayoutComponent` forwards the `[brandIcon]` slot here).                                                                                                         |
| [AdminBreadcrumbComponent](classes/AdminBreadcrumbComponent.md)               | Breadcrumb: the path of the current page in the menu. Not rendered when preferences hide it, when there is only one level that is required to be hidden, or when nothing matches.                                                                                                                                                           |
| [AdminCommandPaletteComponent](classes/AdminCommandPaletteComponent.md)       | Command palette: aggregates menus, commands and sources registered by the application (such as full-text search); keyboard up/down selection, Enter executes. Rendered as a native modal `<dialog>`; the input is a combobox and the results are a listbox.                                                                                 |
| [AdminFooterComponent](classes/AdminFooterComponent.md)                       | Footer: copyright information and ICP filing number. Not rendered when the layout does not show the footer.                                                                                                                                                                                                                                 |
| [AdminHeaderComponent](classes/AdminHeaderComponent.md)                       | Header: menu toggle, brand (in header layout), horizontal menu, breadcrumb and widgets. Not rendered when content is maximized.                                                                                                                                                                                                             |
| [AdminHeaderMenuComponent](classes/AdminHeaderMenuComponent.md)               | Horizontal menu of top navigation: groups expand children on hover, and the current page is highlighted.                                                                                                                                                                                                                                    |
| [AdminHeaderWidgetsComponent](classes/AdminHeaderWidgetsComponent.md)         | Header widget area: renders the search, theme, language, timezone, fullscreen, refresh, lock screen and settings entries in the preference order with the preference visibility.                                                                                                                                                            |
| [AdminLayoutComponent](classes/AdminLayoutComponent.md)                       | Admin shell layout: sidebar / header / tab bar / content area / footer, plus the preferences drawer, command palette, lock screen and watermark. Layout mode, sizes and visibility are all driven by shell preferences; router-library-agnostic — the application only passes the current address and navigates in the `navigate` callback. |
| [AdminLockScreenComponent](classes/AdminLockScreenComponent.md)               | Lock screen: a modal `<dialog>` covers the UI, Esc cannot close it; requires setting a password first when none is set, and a forgotten password can be reset (data is unaffected). The `<dialog>` stays closed when not locked.                                                                                                            |
| [AdminMenuTreeComponent](classes/AdminMenuTreeComponent.md)                   | Sidebar menu tree: groups are collapsible (accordion driven by preferences), the current page is highlighted, and the tree flattens to an icon rail when collapsed.                                                                                                                                                                         |
| [AdminPageDirective](classes/AdminPageDirective.md)                           | Marks the page content of `AdminLayoutComponent` so "Refresh" can recreate it.                                                                                                                                                                                                                                                              |
| [AdminPreferencesDrawerComponent](classes/AdminPreferencesDrawerComponent.md) | Preferences drawer: five tabs driven by the schema, with reset / copy / import configuration in the footer. Rendered as a native modal `<dialog>`; focus trap, Esc and backdrop inertness are handled by the browser.                                                                                                                       |
| [AdminSidebarComponent](classes/AdminSidebarComponent.md)                     | Sidebar: brand, menu tree, collapse button, width drag; hover to expand when collapsed, a drawer on mobile. Not rendered when the layout does not need a sidebar.                                                                                                                                                                           |
| [AdminTabbarComponent](classes/AdminTabbarComponent.md)                       | Tab bar: multiple tabs, pinning, drag / keyboard reordering, context menu, middle-click close, wheel horizontal scrolling. Not rendered when preferences disable it or there are no tabs yet.                                                                                                                                               |
| [AdminWatermarkComponent](classes/AdminWatermarkComponent.md)                 | Watermark: a tiled rotated-text overlay that intercepts no interaction. Not rendered when preferences disable it or the text is empty.                                                                                                                                                                                                      |

## Interfaces

| Interface                                          | Description                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [MenuExtraContext](interfaces/MenuExtraContext.md) | Context of the extra-content template of menu items: `let-node` is the current menu node. |

## Type Aliases

| Type Alias                                             | Description                                                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [AdminIcon](type-aliases/AdminIcon.md)                 | Icon type used by menu, breadcrumb and command palette entries: the icon input of `@lucide/angular` (icon class, icon data or icon name). Use it as the generic parameter when creating the shell: `createAdminShell<AdminIcon>({ ... })`. |
| [MenuExtraTemplate](type-aliases/MenuExtraTemplate.md) | Extra-content template on the right of menu items (badge, count).                                                                                                                                                                          |

## Variables

| Variable                                 | Description                              |
| ---------------------------------------- | ---------------------------------------- |
| [ADMIN\_SHELL](variables/ADMIN_SHELL.md) | The admin shell in the current injector. |

## Functions

| Function                                                | Description                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [injectAdminShell](functions/injectAdminShell.md)       | Reads the nearest shell; must be called in an injection context.                                                                                                                                                                                                                                  |
| [injectAdminStore](functions/injectAdminStore.md)       | Bridges a readable store of the shell into a signal: templates / `computed` depending on it recompute when the value changes; unsubscribes when the current injection context is destroyed. Must be called in an injection context (constructor or field initializer).                            |
| [injectAdminText](functions/injectAdminText.md)         | The translation function. Calling it in a template, `computed` or `effect` establishes a signal dependency on `shell.text`, so OnPush + zoneless components also re-render after language or catalog changes. Must be called in an injection context.                                             |
| [interceptNavigation](functions/interceptNavigation.md) | A plain left click is taken over by the shell as SPA navigation; modified keys and the middle button are still handed to the browser (opening a new tab).                                                                                                                                         |
| [provideAdminShell](functions/provideAdminShell.md)     | Provides the shell and binds it to the browser during environment initialization (shortcuts, theme, layout variables, title), unbinding when the injector is destroyed. Environment initialization happens before any component's first render, so no theme flash occurs; `attach` is idempotent. |
