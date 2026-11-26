# SqliteBackupStorage

```ts
type SqliteBackupStorage = 
  | {
  kind: "memory";
  label: string;
}
  | {
  kind: "persistent";
  label: string;
  storageKey: string;
}
  | {
  actual: string;
  field: string;
  kind: "unsupported";
};
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L25)

The storage backend corresponding to the adapter's current configuration, deciding whether backup / restore is possible and which path restore takes.

- `memory`: the database only lives inside the current adapter instance; the restored connection is taken over by it directly
- `persistent`: the database lives in browser persistent storage; restore is protected by a Web Lock and an in-database marker table, and normal connection works afterwards
- `unsupported`: a combination not yet delivered; both backup and restore report `unsupported_combination`

## Union Members

### Type Literal

```ts
{
  kind: "memory";
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

The `adapter.storage` written into the manifest, for example `memory`.

***

### Type Literal

```ts
{
  kind: "persistent";
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

The `adapter.storage` written into the manifest, for example `idb` / `opfs`.

#### storageKey

```ts
readonly storageKey: string;
```

The unique key of the same persistent database; the lock name is based on it.

***

### Type Literal

```ts
{
  actual: string;
  field: string;
  kind: "unsupported";
}
```

#### actual

```ts
readonly actual: string;
```

The actual value of the option.

#### field

```ts
readonly field: string;
```

The name of the option causing the lack of support, written into the error's `details.field`.

#### kind

```ts
readonly kind: "unsupported";
```
