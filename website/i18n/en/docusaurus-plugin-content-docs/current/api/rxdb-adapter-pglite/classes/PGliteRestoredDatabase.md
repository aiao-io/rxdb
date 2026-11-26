# PGliteRestoredDatabase

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts#L21)

One-shot database handle obtained after restoring to a memory target.

## Remarks

A memory database only lives inside the PGlite instance that created it — there is no "reopen the same location" — so the restore result cannot stay in storage waiting for the next connection like an IndexedDB target; the instance itself must be handed to the adapter. The handle can be claimed only once, and only by the RxDB instance validated during restore, with the same set of extensions: compatibility (schema fingerprint, auth domain, extensions) was judged against that instance, and letting a different instance with the same name but a different schema claim it would bypass the validation. When unused, the caller is responsible for [PGliteRestoredDatabase.close](#close).

## Example

```typescript
const { database } = await restorePGliteDatabase(source, { rxdb, options: { store: 'memory' } });
rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory', restoredDatabase: database }));
await rxdb.connect('pglite');
```

## Constructors

### Constructor

```ts
new PGliteRestoredDatabase(
   pglite, 
   rxdb, 
   extensions
): PGliteRestoredDatabase;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts#L32)

**`Internal`**

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pglite` | `PGlite` |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `extensions` | readonly `string`[] |

#### Returns

`PGliteRestoredDatabase`

## Accessors

### consumed \{#consumed\}

#### Get Signature

```ts
get consumed(): boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts#L27)

Whether the handle has been claimed or closed.

##### Returns

`boolean`

## Methods

### assertAdoptableBy() \{#assertadoptableby\}

```ts
assertAdoptableBy(rxdb, extensions): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts#L50)

**`Internal`**

Admission check before the adapter connects: the claimant must be the RxDB instance validated during restore.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The claimant |
| `extensions` | readonly `string`[] | The claimant adapter's extensions (result of `pgliteBackupExtensions`) |

#### Returns

`void`

#### Remarks

The client only knows the database name; instance identity can only be judged by the adapter, so this step lives in the adapter, before [PGliteRestoredDatabase.take](#take). A failed check does not consume the handle; the correct instance can still claim it.

#### Throws

RxDBBackupError `invalid_state` when it is not the validated instance, the extensions differ, or it was already claimed

***

### close() \{#close\}

```ts
close(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts#L75)

Discards an unclaimed instance; does nothing when already claimed (the instance is the adapter's to manage).

#### Returns

`Promise`&lt;`void`&gt;

***

### take() \{#take\}

```ts
take(dbName, extensions): PGlite;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-restored-database.ts#L68)

**`Internal`**

Claims the restored instance.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `dbName` | `string` | The claimant's database name (`rxdb.config.dbName`) |
| `extensions` | readonly `string`[] | Extensions loaded by the claimant (result of `pgliteBackupExtensions`) |

#### Returns

`PGlite`

The PGlite instance; ownership transfers with it

#### Throws

RxDBBackupError `invalid_state` when already claimed / closed, or the database name or extensions do not match the restore target
