# DrawerRow

Defined in: [preferences/drawer-model.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L42)

A row of settings in the drawer.

## Properties

### control \{#control\}

```ts
readonly control: ResolvedControl;
```

Defined in: [preferences/drawer-model.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L52)

The control.

---

### enabled \{#enabled\}

```ts
readonly enabled: boolean;
```

Defined in: [preferences/drawer-model.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L56)

Whether it can be operated.

---

### hint? \{#hint\}

```ts
readonly hint?: string;
```

Defined in: [preferences/drawer-model.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L50)

The description.

---

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [preferences/drawer-model.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L44)

The preference item identifier.

---

### label \{#label\}

```ts
readonly label: string;
```

Defined in: [preferences/drawer-model.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L48)

The title.

---

### labelHidden \{#labelhidden\}

```ts
readonly labelHidden: boolean;
```

Defined in: [preferences/drawer-model.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L58)

`true` when the title duplicates the title of the group it belongs to (the group has only this row): the title is visually hidden but kept for assistive technology.

---

### path \{#path\}

```ts
readonly path: string;
```

Defined in: [preferences/drawer-model.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L46)

The preference path.

---

### value \{#value\}

```ts
readonly value: unknown;
```

Defined in: [preferences/drawer-model.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L54)

The current value; the "default" of a nullable segmented control is represented as an empty string.

## Methods

### set() \{#set\}

```ts
set(value): void;
```

Defined in: [preferences/drawer-model.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L60)

Writes a new value; an empty string of a nullable segmented control is written as `null`.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `unknown` |

#### Returns

`void`
