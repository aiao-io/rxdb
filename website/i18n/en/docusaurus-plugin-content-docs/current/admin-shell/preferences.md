# Preferences, themes, and extensions

Every configurable option in the shell is a typed preference tree `AdminPreferences`. Each item is declared by a `PreferenceItem` (path, control, tab, section, constraints). The preferences drawer renders five tabs from the schema: Appearance, Layout, Shortcuts, General, Extensions.

## Creating the shell

```typescript
import { createAdminShell, pickThemes } from '@aiao/rxdb-admin';

export const shell = createAdminShell({
  brand: { title: 'Workbench' },
  navigate: url => router.navigate(url),
  storagePrefix: 'aiao.workbench',
  themes: pickThemes(['light', 'dark', 'cupcake', 'dracula'])
});
```

| Option          | Description                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `navigate`      | Route navigation; the shell is router-agnostic                                                       |
| `brand`         | App name: used for the sidebar / top bar, dynamic title, and default watermark text                  |
| `themes`        | Available themes; must match the daisyUI themes enabled in your styles; defaults to `light` / `dark` |
| `defaults`      | App-level default preferences, overriding the package defaults                                       |
| `extensions`    | Business extension preferences, shown on the Extensions tab                                          |
| `migrateLegacy` | Migrate preferences from legacy storage keys on first use                                            |
| `storagePrefix` | Storage key prefix; isolates multiple apps on the same origin; defaults to `aiao.admin`              |
| `i18n`          | The app's own i18n runtime; defaults to a static runtime containing only the shell's texts           |
| `homeUrl`       | Home address; returned to after closing the last tab; defaults to `/`                                |

## Storage and sync

Preferences store only the **diff from defaults**: key `<storagePrefix>.preferences`, content `{ "version": 1, "values": { ... } }`. So when an app upgrade changes a default, users who never changed it follow automatically; "reset" just clears the key.

- **Multiple tabs**: writes from other tabs on the same origin sync to the current page through the `storage` event.
- **When it is written**: writes are debounced; on page hide (`pagehide`), if this instance has unsaved changes they are written immediately — a stale snapshot never overwrites values another tab just wrote.
- **Sanitization**: UI, imports, and writes from other tabs all pass through the same constraints (ranges, enums, required), so the state tree is always legal.
- **Export / import**: "Copy config / Import config" in the drawer footer send and receive a diff JSON, e.g. `{"theme":{"name":"dracula"}}`; import replaces the current preferences wholesale; invalid JSON or a non-object shows an error and changes nothing.

### App defaults and legacy key migration

```typescript
createAdminShell({
  // ...
  defaults: { navigation: { accordion: false } },
  migrateLegacy: storage => {
    const theme = storage.getItem('theme');
    return theme === 'light' || theme === 'dark' ? { theme: { name: theme } } : null;
  }
});
```

`migrateLegacy` runs once, only when the new key does not exist, and returns a patch to merge into the preferences; returning `null` means there is nothing to migrate. Migrated preferences are written to the new key immediately; from then on the new key wins, and later changes to the old key have no effect.

## No flash on first paint

Theme and layout variables must be in place before the framework renders. The core package generates an inline script sourced from the same logic as the shell — put it in the `<head>` of `index.html`, and call `shell.attach()` in the entry before rendering:

```typescript
import { createBootstrapScript } from '@aiao/rxdb-admin';

// Returns the script text to inline into <head>
createBootstrapScript({ storageKey: 'aiao.workbench.preferences' });
```

Assert in your app's unit tests that `index.html` contains this script, to prevent storage-key or logic drift (`workbench-shell.spec.ts` in `apps/rxdb-admin-template-react` is a ready-made example).

## Themes

Theme names come from the daisyUI catalog; the shell converts the selection into the root node's `data-theme`, `color-scheme`, and CSS variables (primary color, radius, font size). `system` follows the OS light/dark setting and resolves between the light and dark themes. The primary color automatically picks a foreground color with sufficient contrast; the semi-dark sidebar / top bar use the dark theme among the available themes.

Model tables (VTable) draw on a canvas and do not read CSS variables: the `@aiao/rxdb-model` packages read the root node's computed `color-scheme` through `isDocumentDarkMode()` and use `observeDocumentTheme()` to tell the three frameworks' tables to repaint when the theme changes — so no table stays on a white background under any daisyUI dark theme.

## Extension preferences

Register your own settings as extensions; values live under `extension.<key>` and get the same sanitization, persistence, and cross-tab sync. Four control types are supported: `switch`, `text`, `select`, `number`:

```typescript
createAdminShell({
  // ...
  extensions: [
    {
      key: 'searchPageSize',
      type: 'number',
      label: 'Full-text search page size',
      hint: 'Results loaded per search page; takes effect immediately',
      section: 'Full-text search',
      defaultValue: 20,
      min: 5,
      max: 50,
      step: 5
    }
  ]
});
```

Read and write:

```typescript
shell.preferences.value.extension['searchPageSize'];
shell.preferences.setPath('extension.searchPageSize', 10);
```

Binding layers subscribe to `shell.preferences` through their own reactive bridges; components update automatically when a value changes (see [Framework usage](./frameworks.md)).

## Command palette, shortcuts, and commands

```typescript
// Async source: e.g. plug into full-text search and navigate on a hit
shell.palette.registerSource({
  id: 'records',
  groupLabelKey: 'palette.group.records',
  minQueryLength: 1,
  search: async (query, signal) => [
    {
      id: 'record:1',
      label: 'Matching record',
      sublabel: 'Asset category · name',
      run: () => shell.navigate('/entities/assets/AssetCategory')
    }
  ]
});

shell.registerCommand({ id: 'sync', label: 'Sync now', keywords: ['sync'], run: () => sync() });
shell.shortcuts.register({ id: 'sync', combo: 'Mod+Shift+S', label: 'Sync now', handler: () => sync() });
```

- `Mod` is ⌘ on macOS and Ctrl elsewhere; combos containing Alt match on the physical key (`event.code`).
- A source can declare `minQueryLength`; when a new input supersedes the query, it receives cancellation via `signal`.
- If a source uses handles from `@aiao/rxdb-plugin-search`, wait for `state$` to settle before reading `results$`, and do not combine the two with `combineLatest` — they derive from the same snapshot, so the state arrives first while the results are still the old values.

## Lock screen boundaries

The lock screen is "privacy from prying eyes", not a security boundary: the password is stored locally as a salted PBKDF2-SHA256 (Web Crypto) hash, and the locked state persists and syncs across tabs, but **business data is not encrypted**. For encrypted data use `@aiao/rxdb-adapter-encrypted`. When the environment lacks `crypto.subtle` (not HTTPS and not localhost), setting a password errors out — it never falls back to a weaker hash.

## Internationalization

Shell texts live in the `rxdb-admin` namespace; the package ships `zh-Hans` and `en`. The default is a static runtime containing only the shell catalog. If your app already has an `@aiao/rxdb-i18n` runtime, add the core package's exported `adminMessages` to its `catalogs` and pass the runtime through the `i18n` option — language switches then take effect site-wide.

## Style contract

`@aiao/rxdb-admin/admin.css` is the style contract shared by the three frameworks: almost everything lives in `@layer components` and uses only daisyUI theme variables, so apps can override it in higher layers. The few overrides that must beat daisyUI (unselected tab foreground in the preferences drawer, sidebar menu width / radius / icon track) live in `@layer utilities` at the end of the file: daisyUI's rules sit in sublayers of `utilities`, so any specificity written in the `components` layer loses. The same applies when the app overrides daisyUI's subcomponent styles itself: write them in the `utilities` layer proper.
