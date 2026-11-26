# PreferenceOption

Defined in: [preferences/schema/types.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L10)

An option. `labelKey` goes through translation, `label` is a literal (dynamic options such as timezone, language).

## Properties

### label? \{#label\}

```ts
readonly label?: string;
```

Defined in: [preferences/schema/types.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L16)

The literal copy, used when there is no `labelKey`.

---

### labelKey? \{#labelkey\}

```ts
readonly labelKey?: string;
```

Defined in: [preferences/schema/types.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L14)

The translation key.

---

### value \{#value\}

```ts
readonly value: string;
```

Defined in: [preferences/schema/types.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L12)

The option value.
