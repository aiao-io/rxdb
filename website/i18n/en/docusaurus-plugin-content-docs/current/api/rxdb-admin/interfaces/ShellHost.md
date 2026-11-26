# ShellHost

Defined in: [shell/types.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L19)

The browser host the shell depends on, defaulting to the global object; SSR and tests may omit it.

## Properties

### document? \{#document\}

```ts
readonly document?: Document;
```

Defined in: [shell/types.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L23)

The document: root element styles, title, fullscreen.

---

### window? \{#window\}

```ts
readonly window?: Window;
```

Defined in: [shell/types.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L21)

The window: keyboard, storage events, media queries, `navigator`.
