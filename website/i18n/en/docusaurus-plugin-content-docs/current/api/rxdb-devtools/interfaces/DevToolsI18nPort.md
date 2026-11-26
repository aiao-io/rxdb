# DevToolsI18nPort

Defined in: [i18n-port.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L52)

The structural port explicitly injected by the application; DevTools does not depend on any i18n implementation package.

## Properties

### clearMissingMessages? \{#clearmissingmessages\}

```ts
clearMissingMessages?: () => Promise<void>;
```

Defined in: [i18n-port.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L58)

An optional ability to clear diagnostics; when omitted, inspection only.

#### Returns

`Promise`&lt;`void`&gt;

***

### inspection$ \{#inspection\}

```ts
readonly inspection$: Subscribable<unknown>;
```

Defined in: [i18n-port.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L54)

Language, catalog or diagnostic changes.

## Methods

### inspect() \{#inspect\}

```ts
inspect(): Promise<Omit<DevToolsI18nSnapshot, "canClearMissing">>;
```

Defined in: [i18n-port.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L56)

Returns a snapshot detached from mutable runtime references.

#### Returns

`Promise`&lt;`Omit`&lt;[`DevToolsI18nSnapshot`](DevToolsI18nSnapshot.md), `"canClearMissing"`&gt;&gt;
