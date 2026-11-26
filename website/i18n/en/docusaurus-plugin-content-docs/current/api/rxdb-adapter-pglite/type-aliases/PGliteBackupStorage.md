# PGliteBackupStorage

```ts
type PGliteBackupStorage =
  | {
      kind: 'memory';
    }
  | {
      kind: 'idb';
      name: string;
      storageKey: string;
    };
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts#L39)

The storage backend where the data directory lives; only these two variants support backup and restore.

## Union Members

### Type Literal

```ts
{
  kind: 'memory';
}
```

---

### Type Literal

```ts
{
  kind: 'idb';
  name: string;
  storageKey: string;
}
```

#### kind

```ts
readonly kind: "idb";
```

#### name

```ts
readonly name: string;
```

The part after `idb://`.

#### storageKey

```ts
readonly storageKey: string;
```

The normalized `dataDir` text; lock names and restore markers are keyed by it.
