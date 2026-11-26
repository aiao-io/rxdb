# RxDBBackupCompatibility

Defined in: [packages/rxdb/src/backup/backup.interface.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L79)

The target side's compatibility expectations, computed by the adapter from the target configuration provided in advance.

## Properties

### adapterName \{#adaptername\}

```ts
readonly adapterName: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L80)

---

### authDomain \{#authdomain\}

```ts
readonly authDomain: string | null;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L91)

The target's encryption auth domain; `null` when the target entities have no encrypted columns.

---

### changeCodecVersion \{#changecodecversion\}

```ts
readonly changeCodecVersion: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L86)

---

### constraintFingerprint \{#constraintfingerprint\}

```ts
readonly constraintFingerprint: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L89)

The target's entity-level storage constraint fingerprint ([getRxDBBackupConstraintFingerprint](../functions/getRxDBBackupConstraintFingerprint.md)).

---

### engine \{#engine\}

```ts
readonly engine: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L81)

---

### engineCompatibility \{#enginecompatibility\}

```ts
readonly engineCompatibility: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L82)

---

### extensions \{#extensions\}

```ts
readonly extensions: readonly string[];
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L84)

The extensions the target can provide.

---

### schemaFingerprint \{#schemafingerprint\}

```ts
readonly schemaFingerprint: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L87)

---

### systemSchemaVersion \{#systemschemaversion\}

```ts
readonly systemSchemaVersion: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L85)
