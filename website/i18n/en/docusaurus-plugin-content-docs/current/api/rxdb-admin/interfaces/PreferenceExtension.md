# PreferenceExtension

Defined in: [preferences/schema/types.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L77)

A business custom preference; the value is stored under `extension.<key>`.

## Properties

### defaultValue \{#defaultvalue\}

```ts
readonly defaultValue: string | number | boolean;
```

Defined in: [preferences/schema/types.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L83)

The default value; its type must match `type`.

---

### hint? \{#hint\}

```ts
readonly hint?: string;
```

Defined in: [preferences/schema/types.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L89)

The literal description.

---

### hintKey? \{#hintkey\}

```ts
readonly hintKey?: string;
```

Defined in: [preferences/schema/types.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L91)

The description translation key.

---

### key \{#key\}

```ts
readonly key: string;
```

Defined in: [preferences/schema/types.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L79)

The extension key, unique.

---

### label? \{#label\}

```ts
readonly label?: string;
```

Defined in: [preferences/schema/types.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L85)

The literal title.

---

### labelKey? \{#labelkey\}

```ts
readonly labelKey?: string;
```

Defined in: [preferences/schema/types.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L87)

The title translation key.

---

### max? \{#max\}

```ts
readonly max?: number;
```

Defined in: [preferences/schema/types.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L101)

The upper bound for `number`.

---

### min? \{#min\}

```ts
readonly min?: number;
```

Defined in: [preferences/schema/types.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L99)

The lower bound for `number`.

---

### options? \{#options\}

```ts
readonly options?: readonly PreferenceOption[];
```

Defined in: [preferences/schema/types.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L97)

The options of `select`.

---

### section? \{#section\}

```ts
readonly section?: string;
```

Defined in: [preferences/schema/types.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L93)

The group title, defaulting to the "General" group.

---

### sectionKey? \{#sectionkey\}

```ts
readonly sectionKey?: string;
```

Defined in: [preferences/schema/types.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L95)

The group title translation key, taking precedence over the literal title.

---

### step? \{#step\}

```ts
readonly step?: number;
```

Defined in: [preferences/schema/types.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L103)

The step of `number`.

---

### type \{#type\}

```ts
readonly type: "number" | "select" | "switch" | "text";
```

Defined in: [preferences/schema/types.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L81)

The control type.
