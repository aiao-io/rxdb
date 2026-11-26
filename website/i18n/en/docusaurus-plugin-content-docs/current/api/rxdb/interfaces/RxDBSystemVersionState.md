# RxDBSystemVersionState

Defined in: [packages/rxdb/src/system/migration.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L117)

The two version numbers read out of the migration records

## Remarks

A fresh database reads `{ schemaVersion: 0, codecVersion: 0 }` — **0 means "no watermark row", not "version 0"**,
because watermark numbers are numbered from 1 ([getRxDBSystemVersionState](../functions/getRxDBSystemVersionState.md) rejects encodings with a `0` prefix). So
"uninitialized" and "behind" are the same path downstream: both fail [isCurrentRxDBSystemVersion](../functions/isCurrentRxDBSystemVersion.md),
and both run that whole idempotent `migrateSystemSchema()`.

## Properties

### codecVersion \{#codecversion\}

```ts
codecVersion: number;
```

Defined in: [packages/rxdb/src/system/migration.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L122)

The change codec version; `0` means the database has no watermark row yet

***

### schemaVersion \{#schemaversion\}

```ts
schemaVersion: number;
```

Defined in: [packages/rxdb/src/system/migration.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L119)

The system table schema version; `0` means the database has no watermark row yet
