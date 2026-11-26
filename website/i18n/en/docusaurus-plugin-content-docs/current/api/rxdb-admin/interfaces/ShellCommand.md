# ShellCommand

Defined in: [shell/types.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L67)

A command registered in the command palette.

## Properties

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [shell/types.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L69)

The unique identifier.

---

### keywords? \{#keywords\}

```ts
readonly keywords?: readonly string[];
```

Defined in: [shell/types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L73)

Extra search terms.

---

### label \{#label\}

```ts
readonly label: string;
```

Defined in: [shell/types.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L71)

The display text.

---

### run \{#run\}

```ts
readonly run: () => void | Promise<void>;
```

Defined in: [shell/types.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L75)

Executes.

#### Returns

`void` \| `Promise`&lt;`void`&gt;
