# SqliteBackupStorage

```ts
type SqliteBackupStorage =
  | {
      kind: 'memory';
      label: string;
    }
  | {
      kind: 'persistent';
      label: string;
      storageKey: string;
    }
  | {
      actual: string;
      field: string;
      kind: 'unsupported';
    };
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L25)

The storage backend corresponding to the adapter's current configuration, determining whether backup / restore is possible and which restore path is taken.

- `memory`: the database only lives in the current adapter instance; the restored connection is taken over by it directly
- `persistent`: the database lives in browser persistent storage; restore is protected by the Web Lock and the in-database marker table, after which connecting normally is enough
- `unsupported`: a combination not delivered yet; both backup and restore report `unsupported_combination`

## Union Members

### Type Literal

```ts
{
  kind: 'memory';
  label: string;
}
```

#### kind

```ts
readonly kind: "memory";
```

#### label

```ts
readonly label: string;
```

`adapter.storage` written into the manifest, e.g. `memory`.

---

### Type Literal

```ts
{
  kind: 'persistent';
  label: string;
  storageKey: string;
}
```

#### kind

```ts
readonly kind: "persistent";
```

#### label

```ts
readonly label: string;
```

`adapter.storage` written into the manifest, e.g. `idb` / `opfs`.

#### storageKey

```ts
readonly storageKey: string;
```

Unique key of the same persistent database; the lock name is based on it.

---

### Type Literal

```ts
{
  actual: string;
  field: string;
  kind: 'unsupported';
}
```

#### actual

```ts
readonly actual: string;
```

The actual value of that option.

#### field

```ts
readonly field: string;
```

Name of the option causing the lack of support, written into the error's `details.field`.

#### kind

```ts
readonly kind: "unsupported";
```
