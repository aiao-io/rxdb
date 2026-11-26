# DevToolsI18nSnapshot

Defined in: [i18n-port.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L38)

The optional i18n snapshot of `database.inspect`.

## Properties

### availableLocales \{#availablelocales\}

```ts
readonly availableLocales: readonly string[];
```

Defined in: [i18n-port.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L42)

The available catalog languages.

---

### canClearMissing \{#canclearmissing\}

```ts
readonly canClearMissing: boolean;
```

Defined in: [i18n-port.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L48)

The current session simultaneously satisfies the capability tier, the write policy, the provider and the clear port.

---

### locale \{#locale\}

```ts
readonly locale: string;
```

Defined in: [i18n-port.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L40)

The currently active language.

---

### messages \{#messages\}

```ts
readonly messages: readonly DevToolsI18nMessage[];
```

Defined in: [i18n-port.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L44)

The catalog rows including overridden versions.

---

### missingMessages \{#missingmessages\}

```ts
readonly missingMessages: readonly DevToolsI18nMissingMessage[];
```

Defined in: [i18n-port.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L46)

The diagnostics for missing messages.
