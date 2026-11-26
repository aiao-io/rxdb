# RxDBCapabilityClaim

Defined in: [packages/rxdb/src/system/capability-watermark.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L31)

One capability claim: who (`packageSpecifier`) enabled which version of which capability (`capability`) on this database.

## Properties

### capability \{#capability\}

```ts
readonly capability: string;
```

Defined in: [packages/rxdb/src/system/capability-watermark.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L33)

The capability name, same value as the `IRxDBPlugin.name` of the plugin that contributes it

---

### packageSpecifier \{#packagespecifier\}

```ts
readonly packageSpecifier: string;
```

Defined in: [packages/rxdb/src/system/capability-watermark.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L39)

The package specifier, e.g. `@aiao/rxdb-plugin-working-tree`; reported to the user as-is when unclaimed

---

### version \{#version\}

```ts
readonly version: number;
```

Defined in: [packages/rxdb/src/system/capability-watermark.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L36)

The capability version, a positive integer; comparison is the claimer's own responsibility (core only tracks "whether someone claimed it")
