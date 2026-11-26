# RxDBBackupManifest

Defined in: [packages/rxdb/src/backup/backup.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L36)

Archive metadata. Written at the very front of the archive; on restore, compatibility is validated before anything is written to the target.

## Properties

### adapter \{#adapter\}

```ts
readonly adapter: object;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L42)

#### engine

```ts
readonly engine: string;
```

Database engine, e.g. `postgres`.

#### engineCompatibility

```ts
readonly engineCompatibility: string;
```

Engine data-format compatibility key; on restore it must equal the target verbatim.

#### engineVersion

```ts
readonly engineVersion: string;
```

Full engine version, recorded for reference only.

#### extensions

```ts
readonly extensions: readonly string[];
```

Extensions loaded by the source database; the target must provide all of them.

#### name

```ts
readonly name: string;
```

Adapter identifier, e.g. `pglite`.

#### storage

```ts
readonly storage: string;
```

Source storage backend, e.g. `memory` / `idb`, recorded for reference only.

---

### constraintFingerprint? \{#constraintfingerprint\}

```ts
readonly constraintFingerprint?: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L71)

Entity-level storage constraint fingerprint (the result of [getRxDBBackupConstraintFingerprint](../functions/getRxDBBackupConstraintFingerprint.md)).

#### Remarks

Archives written by 0.0.28 or earlier do not have this field: on restore only the remaining fields are compared (the upper bound of what such archives can verify), and a configuration that differs only in constraints is only caught later by the constraint-drift check in `connect()`. Older versions ignore this field when reading an archive that has it; the format version is unchanged.

---

### createdAt \{#createdat\}

```ts
readonly createdAt: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L40)

Time the snapshot was captured (ISO 8601).

---

### encryption \{#encryption\}

```ts
readonly encryption:
  | {
  authDomain: string;
}
  | null;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L73)

Encryption auth domain; `null` when there are no encrypted columns.

---

### format \{#format\}

```ts
readonly format: "rxdb-backup";
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L37)

---

### formatVersion \{#formatversion\}

```ts
readonly formatVersion: 1;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L38)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: object;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L56)

#### changeCodecVersion

```ts
readonly changeCodecVersion: number;
```

#### systemSchemaVersion

```ts
readonly systemSchemaVersion: number;
```

#### version

```ts
readonly version: string;
```

Source RxDB version, recorded for reference only; data compatibility is determined by the two version numbers below.

---

### schemaFingerprint \{#schemafingerprint\}

```ts
readonly schemaFingerprint: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L63)

The result of [computeRxDBSchemaFingerprint](../functions/computeRxDBSchemaFingerprint.md).

---

### scope \{#scope\}

```ts
readonly scope: RxDBBackupScope;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L41)
