# rxdb-i18n

Framework-agnostic client-side internationalization runtime. ICU MessageFormat is parsed by `intl-messageformat`; numbers, dates and relative times use the host `Intl.*`. Language preferences and application override catalogs can be stored in RxDB, and components update instantly through native reactive bindings.

## Static catalogs

```ts
import { I18n } from '@aiao/rxdb-i18n';

const i18n = new I18n({
  defaultLocale: 'zh-Hans',
  locale: 'en',
  catalogs: [
    { locale: 'zh-Hans', namespace: 'app', messages: { greeting: '你好，{name}', count: '{count} 条' } },
    {
      locale: 'en',
      namespace: 'app',
      messages: `{ greeting: 'Hello, {name}', count: '{count, plural, one {# item} other {# items}}' }`
    }
  ]
});

i18n.t('greeting', { name: 'Ada' });
i18n.t('count', { count: 2 });
i18n.formatDate(new Date(), { dateStyle: 'long' });
await i18n.setLocale('zh-Hans');
```

Usable immediately after construction in the no-database mode. `t(key, params?, namespace?)` defaults to the `app` namespace, overridable via the `namespace` construction option; when the whole chain misses, the key is returned, and an empty string is a valid message.

## Persistence and cross-tab

Add `i18nEntities()` to `config.entities` when creating the database, which must happen before `RxDB.init()` / the first `connect()`:

```ts
import { i18nEntities, I18n } from '@aiao/rxdb-i18n';

// RxDB options to create: entities: [...applicationEntities, ...i18nEntities()]
const i18n = new I18n({ rxdb, defaultLocale: 'zh-Hans', catalogs });
await i18n.init();
await i18n.setLocale('en');
```

In persistence mode, `await init()` first and only then render the first screen that depends on the language. `I18nSettings` has only one `singleton` row and explicitly declares `SyncType.None`; the language choice stays on the current device, and same-origin tabs follow via the existing `RxDBTabsGateway`. `multiInstance: false` instances do not receive writes from other instances.

`deviceLocale` stores the host-probed value from when the preference row was first created and keeps using it on reopen; the runtime does not overwrite it automatically. `updatedAt` is a monotonic revision time inside the preference row, ensuring that switching languages within the same millisecond still triggers reactive queries.

The runtime's `locale$`, `availableLocales$` and `changes$` provide a synchronous snapshot plus subsequent changes; the three frameworks use `useI18n()` from `@aiao/rxdb-i18n-angular` / `-react` / `-vue` respectively. Call `i18n.destroy()` when the application ends to clean up subscriptions; the database is destroyed by the application independently.

## Catalog overrides and fallback

Catalogs are merged by the same `(locale, namespace, key)`, with priority local `db` overrides, remote cache, bundled `bundle`. Local and remote are stored in separate tables, so deleting the remote cache does not delete application overrides.

```ts
await i18n.setMessages({ locale: 'en', namespace: 'rxdb-model', messages: { 'common.save': 'Publish' } });
await i18n.removeMessages('en', 'rxdb-model', ['common.save']);
```

`registerCatalog()` registers a bundled catalog and fails immediately on a duplicate identity; `setMessages()` creates or updates local overrides; `setRemoteMessages()` / `removeRemoteMessages()` manage the separate remote cache. BCP 47 locales and ICU syntax are validated before a catalog is written.

The fallback order is the requested locale, the user's `devicePreferredLocale`, the host `deviceLocale`, then `defaultLocale`; each node tries the exact locale first and then the parent language, e.g. `fr-CA → fr`, and the whole chain is deduplicated. `canonicalizeLocale()` and `buildLocaleChain()` are the single reusable implementation for data internationalization.

## Remote catalogs

`RemoteMessageEntry` defaults to `SyncType.None`, so a fully local application needs no remote or sync plugin. To distribute catalogs, configure that entity alone as QueryCache via `syncOverrides` before `RxDB.init()`; the library-level `sync` declares the corresponding local and remote adapters at the same time, and installs the QueryCache plugin. Local `MessageEntry` and `I18nSettings` stay `SyncType.None`.

```ts
syncOverrides: [
  {
    entity: RemoteMessageEntry,
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'wa-sqlite' },
      remote: `{ adapter: 'http' }`
    }
  }
];
```

Remote queries use the existing local-first and offline-cache options. When the network is unreachable and the remote cache is empty, the empty catalog lets the bundled catalog remain in effect; resumed queries are driven by the host `reachability` monitor, with no new timers or cross-tab channels. Business errors follow the existing QueryCache semantics; destroying the runtime releases the query and monitor resources. See the `?i18n=1` page of `apps/dev-rxdb-http` for complete integration and remote update / delete examples.

## rxdb-model and diagnostics

Add `modelMessages` from `@aiao/rxdb-model` to the construction catalogs and components use the same runtime through the binding packages' provider. `modelMessages` only registers the default Chinese; the English catalog is registered explicitly via the exported `modelEnMessages`. When an application only overrides some English keys, the remaining keys fall back to Chinese; existing component options copy still takes precedence. Without a configured provider, model components keep their original numeric and date-time output; once a runtime is provided explicitly, date columns are formatted by locale and keep hours, minutes and seconds.

Missing keys in persistence mode are written to `MissingMessageEntry`; `flushDiagnostics()` waits for the queued writes, and `clearMissingMessages()` empties the diagnostics. Background write or external catalog validation errors are surfaced via `errors$`.

`await i18n.inspect()` returns a serializable `I18nInspection`: current locale, available locales, all catalog layers and missing diagnostics. A message's `active` marks the highest-priority version of the same `(locale, namespace, key)` identity. `inspection$` notifies catalog, locale and diagnostic changes; diagnostic clearing only notifies inspectors, avoiding re-recording missing keys right after the application re-translates. DevTools shows the I18n panel through this explicitly injected structure port: `getDevToolsConnector().init(rxdb, getEntityMetadata, { i18n })`. The clear-diagnostics entry is only shown when the connection allows changes; clearing targets the missing-message table and keeps other settings and language preferences.

This package requires the host to have complete `Intl.*`. Mini-program runtimes are explicitly unsupported and can only be unlocked independently after the real-device Intl probe passes.

## Runtime smoke

The `testing` subpath provides the same set of ICU assertions without depending on a test framework, for verifying interpolation, plural, select, parent-language and default-locale fallback in a real host runtime:

```ts
import { assertI18nRuntimeSmoke } from '@aiao/rxdb-i18n/testing';

const result = await assertI18nRuntimeSmoke();
```

Failures throw an error naming the specific case, handled by the host's existing error channel. The repository's Node unit tests, real Chromium tests, the Electron packaged renderer process and the Tauri release WebView share this entry point. Tauri failures enter the Rust self-check JSON along `status: 'failed'`, and the success output is recorded as `i18nRuntimeSmoke` in the report's `message`; Electron reads the result from the real rendered page with Playwright.

## Classes

| Class                                                 | Description                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [I18n](classes/I18n.md)                               | Internationalization runtime backed by RxDB language preferences and catalogs.                         |
| [I18nSettings](classes/I18nSettings.md)               | Language state of the current device; not synced across devices.                                       |
| [MessageEntry](classes/MessageEntry.md)               | Local persistent override row, never cleaned by the remote catalog.                                    |
| [MissingMessageEntry](classes/MissingMessageEntry.md) | Local diagnostic row for missing keys.                                                                 |
| [RemoteMessageEntry](classes/RemoteMessageEntry.md)   | Remote catalog cache, kept in a separate table from MessageEntry to isolate QueryCache orphan cleanup. |

## Interfaces

| Interface                                                                | Description                                                                               |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [CatalogMessage](interfaces/CatalogMessage.md)                           | Structure of a single catalog message.                                                    |
| [I18nInspectedMessage](interfaces/I18nInspectedMessage.md)               | One catalog message and its storage layer.                                                |
| [I18nInspectedMissingMessage](interfaces/I18nInspectedMissingMessage.md) | One missing-message diagnostic.                                                           |
| [I18nInspection](interfaces/I18nInspection.md)                           | Directly serializable inspection snapshot detached from runtime mutable state.            |
| [I18nOptions](interfaces/I18nOptions.md)                                 | Options of the client-side internationalization runtime.                                  |
| [LocalePreferences](interfaces/LocalePreferences.md)                     | The single data contract of the locale fallback chain, shared by UI and data translation. |
| [MessageCatalog](interfaces/MessageCatalog.md)                           | A set of ICU source messages belonging to one locale and namespace.                       |
| [ResolvedMessage](interfaces/ResolvedMessage.md)                         | Lookup result; value is undefined on a miss.                                              |

## Type Aliases

| Type Alias                                     | Description                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- |
| [MessageSource](type-aliases/MessageSource.md) | Message source, prioritized by the storage layer it lives in. |

## Functions

| Function                                              | Description                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [buildLocaleChain](functions/buildLocaleChain.md)     | Each node tries the exact match first and then the parent language, finally deduplicated in order of first appearance. |
| [canonicalizeLocale](functions/canonicalizeLocale.md) | Canonicalizes a non-empty BCP 47 tag; throws RangeError on invalid tags.                                               |
| [catalogMessages](functions/catalogMessages.md)       | Returns rows only after fully validating the catalog, so callers can merge them atomically.                            |
| [i18nEntities](functions/i18nEntities.md)             | Add the returned entities to config.entities before RxDB.init().                                                       |
| [messageId](functions/messageId.md)                   | Encodes the identity as a JSON tuple; separators inside fields cannot collide.                                         |
| [resolveMessage](functions/resolveMessage.md)         | Looks up a message along the locale chain; layer priority within one locale is decided by the caller's merged rows.    |

## References

### I18nRuntime \{#i18nruntime\}

Renames and re-exports [I18n](classes/I18n.md)
