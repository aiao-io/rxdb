# I18nInspectedMessage

Defined in: [inspection.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L4)

One catalog message and its storage layer.

## Properties

### active \{#active\}

```ts
readonly active: boolean;
```

Defined in: [inspection.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L16)

This row is the highest-priority version of the same locale, namespace and key.

---

### key \{#key\}

```ts
readonly key: string;
```

Defined in: [inspection.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L10)

Message key.

---

### locale \{#locale\}

```ts
readonly locale: string;
```

Defined in: [inspection.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L6)

Canonicalized locale.

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [inspection.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L8)

Catalog namespace.

---

### source \{#source\}

```ts
readonly source: MessageSource;
```

Defined in: [inspection.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L14)

The bundle, remote or db storage layer.

---

### value \{#value\}

```ts
readonly value: string;
```

Defined in: [inspection.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L12)

ICU source message.
