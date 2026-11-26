# DevToolsI18nMessage

Defined in: [i18n-port.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L8)

An inspectable catalog message.

## Properties

### active \{#active\}

```ts
readonly active: boolean;
```

Defined in: [i18n-port.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L20)

The currently highest-priority row of the same message identity.

---

### key \{#key\}

```ts
readonly key: string;
```

Defined in: [i18n-port.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L14)

The message key.

---

### locale \{#locale\}

```ts
readonly locale: string;
```

Defined in: [i18n-port.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L10)

The normalized language.

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [i18n-port.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L12)

The catalog namespace.

---

### source \{#source\}

```ts
readonly source: "bundle" | "remote" | "db";
```

Defined in: [i18n-port.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L18)

The layer the message text comes from.

---

### value \{#value\}

```ts
readonly value: string;
```

Defined in: [i18n-port.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/i18n-port.ts#L16)

The ICU source text.
